const CDIA_KEY = 'Canadian direct investment abroad - total book value';
const FDI_KEY  = 'Foreign direct investment in Canada - total book value';
let dataLookup = null;

function buildLookup() {
    dataLookup = {};
    rawData.forEach(d => {
        dataLookup[`${d.parent}|${d.child}|${d.year}`] = d.value;
    });
}

function init() {
    if (typeof rawData === 'undefined' || !rawData.length) return;
    buildLookup();
    populateFilters();
    populateFlowCountryFilter();
    setupEventListeners();
    updateDashboard();
    updateFlowChart();
}

function populateFilters() {
    const years = new Set(rawData.map(d => d.year));
    const yearSelect = document.getElementById('yearFilter');
    
    // Sort years descending
    const sortedYears = Array.from(years).sort().reverse();
    sortedYears.forEach(y => yearSelect.innerHTML += `<option value="${y}">${y}</option>`);
    if (sortedYears.length > 0) yearSelect.value = sortedYears[0];

    updateChildDropdown();
}

function updateChildDropdown() {
    const parent = document.getElementById('parentFilter').value;
    const children = new Set(rawData.filter(d => d.parent === parent).map(d => d.child));
    const childSelect = document.getElementById('childFilter');
    
    const sorted = Array.from(children).sort((a,b) => {
        if(a === 'All countries') return -1;
        if(b === 'All countries') return 1;
        return a.localeCompare(b);
    });

    childSelect.innerHTML = '';
    sorted.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.text = c;
        childSelect.appendChild(opt);
    });
    
    if (childSelect.options.length > 0) childSelect.options[0].selected = true;
}

function setupEventListeners() {
    document.getElementById('parentFilter').addEventListener('change', () => { updateChildDropdown(); updateDashboard(); });
    document.getElementById('childFilter').addEventListener('change', function(e) {
        let selectedOptions = Array.from(this.selectedOptions);
        if (selectedOptions.length > 5) {
            selectedOptions.slice(5).forEach(opt => opt.selected = false);
            alert("Maximum 5 selections allowed for comparison.");
        }
        updateDashboard();
    });
    document.getElementById('yearFilter').addEventListener('change', updateDashboard);
    document.getElementById('metricFilter').addEventListener('change', updateDashboard);
    document.getElementById('flowCountryFilter').addEventListener('change', function() {
        const sel = Array.from(this.selectedOptions);
        if (sel.length > 3) {
            sel.slice(3).forEach(opt => opt.selected = false);
            alert('Maximum 3 selections allowed for this chart.');
        }
        updateFlowChart();
    });
    document.getElementById('netToggle').addEventListener('change', updateFlowChart);
}

let charts = {};

function updateDashboard() {
    const parent = document.getElementById('parentFilter').value;
    const childSelect = document.getElementById('childFilter');
    const selectedChildren = Array.from(childSelect.selectedOptions).map(o => o.value);
    const metric = document.getElementById('metricFilter').value;
    const year = document.getElementById('yearFilter').value;

    if (selectedChildren.length === 0) selectedChildren.push('All countries');

    const isGrowth = metric === 'growth';
    document.getElementById('trendLabel').innerText = isGrowth ? `(+ YoY % Growth)` : `($ Millions)`;

    // 1. Line Chart: Trend over time for top selections
    const datasets = [];
    const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
    let cIndex = 0;
    
    // Get universal years across selected items to align the x-axis
    let allYearsSet = new Set();
    
    selectedChildren.forEach(child => {
        const trendData = rawData.filter(d => d.parent === parent && d.child === child)
            .sort((a,b) => String(a.year).localeCompare(String(b.year)));
        
        trendData.forEach(d => allYearsSet.add(d.year));
        
        // Ensure no gaps so chartjs parses correctly
        const color = colors[cIndex++ % colors.length];
        
        let plotData = [];
        let labels = [];
        
        if (isGrowth) {
            // YoY % Growth
            for(let i=1; i<trendData.length; i++) {
                let current = trendData[i].value;
                let prev = trendData[i-1].value;
                let growth = prev !== 0 ? ((current - prev) / Math.abs(prev)) * 100 : 0;
                plotData.push(growth);
                labels.push(trendData[i].year);
            }
        } else {
            // Absolute Value
            plotData = trendData.map(d => d.value);
            labels = trendData.map(d => d.year);
        }
        
        const coords = labels.map((y, idx) => ({ x: y, y: plotData[idx] }));

        datasets.push({
            label: child.length > 25 ? child.substring(0, 25) + '...' : child,
            data: coords,
            borderColor: color,
            backgroundColor: color + '22',
            borderWidth: 3,
            fill: selectedChildren.length === 1,
            tension: 0.3
        });
    });

    const sortedGlobalYears = Array.from(allYearsSet).sort();
    // Exclude the first year globally if growth mode, as the first year has no prior year to compare to
    const finalLabels = isGrowth ? sortedGlobalYears.filter(y => y !== sortedGlobalYears[0]) : sortedGlobalYears;

    if(charts.line) charts.line.destroy();
    charts.line = new Chart(document.getElementById('lineChart'), {
        type: 'line',
        data: {
            labels: finalLabels,
            datasets: datasets
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { 
                legend: { display: selectedChildren.length > 1, position: 'bottom', labels: {color: '#f8fafc'} },
                tooltip: { callbacks: { label: function(c) { return c.dataset.label + ': ' + Number(c.raw.y).toLocaleString(undefined, { maximumFractionDigits: 1 }) + (isGrowth ? '%' : 'M$'); } } }
            },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: {color: '#94a3b8'} },
                x: { grid: { display: false }, ticks: {color: '#94a3b8'} }
            }
        }
    });

    // 2. Bar Chart: Breakdown of individual items for CURRENT selected year
    const nonCountries = ['All countries', 'North America', 'South and Central America', 'Europe', 'Africa', 'Asia', 'Oceania'];
    
    const breakdownData = rawData.filter(d => 
        d.parent === parent && 
        d.year === year && 
        !nonCountries.includes(d.child)
    ).sort((a,b) => b.value - a.value).slice(0, 10);

    if(charts.bar) charts.bar.destroy();
    charts.bar = new Chart(document.getElementById('barChart'), {
        type: 'doughnut',
        data: {
            labels: breakdownData.map(d => d.child.length > 20 ? d.child.substring(0,20)+'...' : d.child),
            datasets: [{
                data: breakdownData.map(d => d.value),
                backgroundColor: [
                    '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', 
                    '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#14b8a6'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: {color: '#f8fafc', font: {size: 10}} } },
            cutout: '60%'
        }
    });
}

init();

// ── Capital Flow Comparison chart ────────────────────────────────────────────

function populateFlowCountryFilter() {
    const cdiaSet = new Set(rawData.filter(d => d.parent === CDIA_KEY).map(d => d.child));
    const fdiSet  = new Set(rawData.filter(d => d.parent === FDI_KEY).map(d => d.child));
    const common  = [...cdiaSet].filter(c => fdiSet.has(c)).sort((a, b) => {
        if (a === 'All countries') return -1;
        if (b === 'All countries') return 1;
        return a.localeCompare(b);
    });
    const sel = document.getElementById('flowCountryFilter');
    sel.innerHTML = '';
    common.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.text = c;
        sel.appendChild(opt);
    });
    if (sel.options.length > 0) sel.options[0].selected = true;
}

function updateFlowChart() {
    const flowSel = document.getElementById('flowCountryFilter');
    let countries = Array.from(flowSel.selectedOptions).map(o => o.value);
    if (countries.length === 0) countries = ['All countries'];
    const isNet = document.getElementById('netToggle').checked;

    document.getElementById('flowChartLabel').innerText =
        isNet ? '(Net: FDI − CDIA)' : '(CDIA shown as negative)';

    const allYears = [...new Set(rawData.map(d => d.year))].sort();
    const COLORS   = ['#3b82f6', '#10b981', '#f59e0b'];
    const datasets  = [];

    if (isNet) {
        countries.forEach((country, i) => {
            const color = COLORS[i % COLORS.length];
            const data  = allYears.map(yr => {
                const fdi  = dataLookup[`${FDI_KEY}|${country}|${yr}`]  ?? 0;
                const cdia = dataLookup[`${CDIA_KEY}|${country}|${yr}`] ?? 0;
                return fdi - cdia;
            });
            const label = country.length > 30 ? country.slice(0, 30) + '…' : country;
            datasets.push({
                label: label,
                data,
                backgroundColor: data.map(v => (v >= 0 ? color : '#ef4444') + 'bb'),
                borderColor:     data.map(v => v >= 0 ? color : '#ef4444'),
                borderWidth: 1,
                borderRadius: 3
            });
        });
    } else {
        countries.forEach((country, i) => {
            const color = COLORS[i % COLORS.length];
            const label = country.length > 22 ? country.slice(0, 22) + '…' : country;
            const fdiData  = allYears.map(yr => dataLookup[`${FDI_KEY}|${country}|${yr}`]  ?? null);
            const cdiaData = allYears.map(yr => {
                const v = dataLookup[`${CDIA_KEY}|${country}|${yr}`];
                return v != null ? -Math.abs(v) : null;
            });
            datasets.push(
                { label: `FDI ↑ – ${label}`,  data: fdiData,  backgroundColor: color + 'cc', borderColor: color,    borderWidth: 1, borderRadius: 3 },
                { label: `CDIA ↓ – ${label}`, data: cdiaData, backgroundColor: color + '44', borderColor: color,    borderWidth: 1, borderRadius: 3, borderDash: [4,2] }
            );
        });
    }

    if (charts.flow) charts.flow.destroy();
    charts.flow = new Chart(document.getElementById('flowChart'), {
        type: 'bar',
        data: { labels: allYears, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#f8fafc', font: { size: 11 }, boxWidth: 14 } },
                tooltip: {
                    callbacks: {
                        label: c => `${c.dataset.label}: ${Number(c.raw).toLocaleString(undefined, { maximumFractionDigits: 0 })} M$`
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#94a3b8', callback: v => `${(v/1000).toFixed(0)}B` }
                }
            }
        }
    });
}

const CDIA_KEY = 'Canadian direct investment abroad - total book value';
const FDI_KEY  = 'Foreign direct investment in Canada - total book value';
let dataLookup = null;
let breakdownMode = 'country'; // 'country' or 'region'

// Known regional aggregates in the dataset
const REGIONS = ['All countries', 'North America', 'South and Central America', 'Europe', 'Africa', 'Asia', 'Oceania'];

// ── Lookup table ─────────────────────────────────────────────────────────────

function buildLookup() {
    dataLookup = {};
    rawData.forEach(d => {
        dataLookup[`${d.parent}|${d.child}|${d.year}`] = d.value;
    });
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init() {
    if (typeof rawData === 'undefined' || !rawData.length) return;
    buildLookup();
    populateFilters();
    populateFlowCountryFilter();
    setupEventListeners();
    updateDashboard();
    updateFlowChart();

    // Restore saved theme preference
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light');
        document.getElementById('theme-icon').textContent = '\uD83C\uDF19';
        document.getElementById('theme-label').textContent = 'Dark Mode';
    }
}

// ── Theme toggle ─────────────────────────────────────────────────────────────

function toggleTheme() {
    const isLight = document.body.classList.toggle('light');
    document.getElementById('theme-icon').textContent = isLight ? '\uD83C\uDF19' : '\u2600\uFE0F';
    document.getElementById('theme-label').textContent = isLight ? 'Dark Mode' : 'Light Mode';
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    // Redraw charts so tick/legend colours update
    updateDashboard();
    updateFlowChart();
}

// ── Breakdown mode toggle (Country / Region) ─────────────────────────────────

function setBreakdownMode(mode) {
    breakdownMode = mode;
    document.getElementById('btnCountry').classList.toggle('active', mode === 'country');
    document.getElementById('btnRegion').classList.toggle('active', mode === 'region');
    updateDashboard();
}

// ── Populate filters ──────────────────────────────────────────────────────────

function populateFilters() {
    const years = new Set(rawData.map(d => d.year));
    const yearSelect = document.getElementById('yearFilter');

    const sortedYears = Array.from(years).sort().reverse();
    sortedYears.forEach(y => yearSelect.innerHTML += `<option value="${y}">${y}</option>`);
    if (sortedYears.length > 0) yearSelect.value = sortedYears[0];

    updateChildDropdown();
}

/**
 * Build a grouped <select> with <optgroup label="Regions"> and <optgroup label="Countries">.
 * 'All countries' always appears first in the Regions group.
 */
function buildGroupedOptions(items, selectEl) {
    selectEl.innerHTML = '';

    const regionItems   = items.filter(c => REGIONS.includes(c));
    const countryItems  = items.filter(c => !REGIONS.includes(c));

    if (regionItems.length > 0) {
        const grp = document.createElement('optgroup');
        grp.label = 'Regions';
        regionItems.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.text  = c;
            grp.appendChild(opt);
        });
        selectEl.appendChild(grp);
    }

    if (countryItems.length > 0) {
        const grp = document.createElement('optgroup');
        grp.label = 'Countries';
        countryItems.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.text  = c;
            grp.appendChild(opt);
        });
        selectEl.appendChild(grp);
    }
}

function updateChildDropdown() {
    const parent = document.getElementById('parentFilter').value;
    const children = new Set(rawData.filter(d => d.parent === parent).map(d => d.child));
    const childSelect = document.getElementById('childFilter');

    const sorted = Array.from(children).sort((a, b) => {
        if (a === 'All countries') return -1;
        if (b === 'All countries') return 1;
        const aReg = REGIONS.includes(a);
        const bReg = REGIONS.includes(b);
        if (aReg && !bReg) return -1;
        if (!aReg && bReg) return 1;
        return a.localeCompare(b);
    });

    buildGroupedOptions(sorted, childSelect);
    if (childSelect.options.length > 0) childSelect.options[0].selected = true;
}

// ── Event listeners ───────────────────────────────────────────────────────────

function setupEventListeners() {
    document.getElementById('parentFilter').addEventListener('change', () => {
        updateChildDropdown();
        updateDashboard();
    });

    document.getElementById('childFilter').addEventListener('change', function () {
        const sel = Array.from(this.selectedOptions);
        if (sel.length > 5) {
            sel.slice(5).forEach(opt => (opt.selected = false));
            alert('Maximum 5 selections allowed for comparison.');
        }
        updateDashboard();
    });

    document.getElementById('yearFilter').addEventListener('change', updateDashboard);
    document.getElementById('metricFilter').addEventListener('change', updateDashboard);

    document.getElementById('flowCountryFilter').addEventListener('change', function () {
        const sel = Array.from(this.selectedOptions);
        if (sel.length > 3) {
            sel.slice(3).forEach(opt => (opt.selected = false));
            alert('Maximum 3 selections allowed for this chart.');
        }
        updateFlowChart();
    });

    document.getElementById('netToggle').addEventListener('change', updateFlowChart);
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

let charts = {};

/** Returns theme-aware colours for chart labels/grids. */
function getThemeColors() {
    const light = document.body.classList.contains('light');
    return {
        tick:   light ? '#64748b' : '#94a3b8',
        legend: light ? '#0f172a' : '#f8fafc',
        grid:   light ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)'
    };
}

// ── Dashboard update (line + doughnut) ───────────────────────────────────────

function updateDashboard() {
    const parent   = document.getElementById('parentFilter').value;
    const childSel = document.getElementById('childFilter');
    let   selected = Array.from(childSel.selectedOptions).map(o => o.value);
    const metric   = document.getElementById('metricFilter').value;
    const year     = document.getElementById('yearFilter').value;
    const { tick, legend, grid } = getThemeColors();

    if (selected.length === 0) selected = ['All countries'];

    const isGrowth = metric === 'growth';
    document.getElementById('trendLabel').innerText = isGrowth ? '(YoY % Growth)' : '';

    // ── 1. Line Chart ─────────────────────────────────────────────────────────
    const PALETTE = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
    const datasets = [];
    let   cIndex   = 0;
    let   allYearsSet = new Set();

    selected.forEach(child => {
        const trendData = rawData
            .filter(d => d.parent === parent && d.child === child)
            .sort((a, b) => String(a.year).localeCompare(String(b.year)));

        trendData.forEach(d => allYearsSet.add(d.year));

        const color = PALETTE[cIndex++ % PALETTE.length];
        let plotData = [];
        let labels   = [];

        if (isGrowth) {
            for (let i = 1; i < trendData.length; i++) {
                const cur    = trendData[i].value;
                const prev   = trendData[i - 1].value;
                const growth = prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : 0;
                plotData.push(growth);
                labels.push(trendData[i].year);
            }
        } else {
            plotData = trendData.map(d => d.value);
            labels   = trendData.map(d => d.year);
        }

        const coords = labels.map((y, idx) => ({ x: y, y: plotData[idx] }));

        datasets.push({
            label:           child.length > 25 ? child.substring(0, 25) + '...' : child,
            data:            coords,
            borderColor:     color,
            backgroundColor: color + '22',
            borderWidth:     3,
            fill:            selected.length === 1,
            tension:         0.3
        });
    });

    const sortedYears = Array.from(allYearsSet).sort();
    const finalLabels = isGrowth ? sortedYears.filter(y => y !== sortedYears[0]) : sortedYears;

    if (charts.line) charts.line.destroy();
    charts.line = new Chart(document.getElementById('lineChart'), {
        type: 'line',
        data: { labels: finalLabels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: selected.length > 1,
                    position: 'bottom',
                    labels: { color: legend }
                },
                tooltip: {
                    callbacks: {
                        label: c =>
                            `${c.dataset.label}: ${Number(c.raw.y).toLocaleString(undefined, { maximumFractionDigits: 1 })}${isGrowth ? '%' : ' M CAD'}`
                    }
                }
            },
            scales: {
                y: { grid: { color: grid }, ticks: { color: tick } },
                x: { grid: { display: false }, ticks: { color: tick } }
            }
        }
    });

    // ── 2. Doughnut — Top 10 by mode ─────────────────────────────────────────
    let breakdownData;

    if (breakdownMode === 'region') {
        // Only named regions, exclude the overall 'All countries' aggregate
        const regionList = REGIONS.filter(r => r !== 'All countries');
        breakdownData = rawData
            .filter(d => d.parent === parent && d.year === year && regionList.includes(d.child))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    } else {
        // Only country-level rows (exclude all region aggregates)
        breakdownData = rawData
            .filter(d => d.parent === parent && d.year === year && !REGIONS.includes(d.child))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }

    if (charts.bar) charts.bar.destroy();
    charts.bar = new Chart(document.getElementById('barChart'), {
        type: 'doughnut',
        data: {
            labels: breakdownData.map(d => d.child.length > 20 ? d.child.substring(0, 20) + '...' : d.child),
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
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: legend, font: { size: 10 } }
                }
            },
            cutout: '60%'
        }
    });
}

init();

// ── Capital Flow Comparison chart ─────────────────────────────────────────────

function populateFlowCountryFilter() {
    const cdiaSet = new Set(rawData.filter(d => d.parent === CDIA_KEY).map(d => d.child));
    const fdiSet  = new Set(rawData.filter(d => d.parent === FDI_KEY).map(d => d.child));

    const common = [...cdiaSet].filter(c => fdiSet.has(c)).sort((a, b) => {
        if (a === 'All countries') return -1;
        if (b === 'All countries') return 1;
        const aReg = REGIONS.includes(a);
        const bReg = REGIONS.includes(b);
        if (aReg && !bReg) return -1;
        if (!aReg && bReg) return 1;
        return a.localeCompare(b);
    });

    const sel = document.getElementById('flowCountryFilter');
    buildGroupedOptions(common, sel);
    if (sel.options.length > 0) sel.options[0].selected = true;
}

function updateFlowChart() {
    const flowSel  = document.getElementById('flowCountryFilter');
    let countries  = Array.from(flowSel.selectedOptions).map(o => o.value);
    if (countries.length === 0) countries = ['All countries'];
    const isNet = document.getElementById('netToggle').checked;
    const { tick, legend, grid } = getThemeColors();

    document.getElementById('flowChartLabel').innerText =
        isNet ? '(Net: FDI - CDIA)' : '(CDIA shown as negative)';

    const allYears = [...new Set(rawData.map(d => d.year))].sort();

    // One distinct colour per country — both FDI and CDIA bars for a country share its colour,
    // with transparency used to distinguish direction rather than a universal red override.
    const COUNTRY_COLORS = ['#3b82f6', '#10b981', '#f59e0b'];
    const datasets = [];

    if (isNet) {
        countries.forEach((country, i) => {
            const color = COUNTRY_COLORS[i % COUNTRY_COLORS.length];
            const data  = allYears.map(yr => {
                const fdi  = dataLookup[`${FDI_KEY}|${country}|${yr}`]  ?? 0;
                const cdia = dataLookup[`${CDIA_KEY}|${country}|${yr}`] ?? 0;
                return fdi - cdia;
            });
            const label = country.length > 30 ? country.slice(0, 30) + '...' : country;
            datasets.push({
                label:           label,
                data,
                // Same hue for both positive and negative — lighter fill for negative bars
                backgroundColor: data.map(v => v >= 0 ? color + 'cc' : color + '44'),
                borderColor:     color,
                borderWidth:     1,
                borderRadius:    3
            });
        });
    } else {
        countries.forEach((country, i) => {
            const color = COUNTRY_COLORS[i % COUNTRY_COLORS.length];
            const label = country.length > 22 ? country.slice(0, 22) + '...' : country;

            const fdiData  = allYears.map(yr => dataLookup[`${FDI_KEY}|${country}|${yr}`]  ?? null);
            const cdiaData = allYears.map(yr => {
                const v = dataLookup[`${CDIA_KEY}|${country}|${yr}`];
                return v != null ? -Math.abs(v) : null;
            });

            // FDI: solid fill; CDIA: 25% opacity — same hue per country
            datasets.push(
                { label: `FDI \u2014 ${label}`,  data: fdiData,  backgroundColor: color + 'cc', borderColor: color, borderWidth: 1, borderRadius: 3 },
                { label: `CDIA \u2014 ${label}`, data: cdiaData, backgroundColor: color + '40', borderColor: color, borderWidth: 1, borderRadius: 3 }
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
                legend: {
                    position: 'bottom',
                    labels: { color: legend, font: { size: 11 }, boxWidth: 14 }
                },
                tooltip: {
                    callbacks: {
                        label: c =>
                            `${c.dataset.label}: ${Number(c.raw).toLocaleString(undefined, { maximumFractionDigits: 0 })} M CAD`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: tick }
                },
                y: {
                    grid: { color: grid },
                    ticks: {
                        color: tick,
                        callback: v => `${(v / 1000).toFixed(0)}B`
                    }
                }
            }
        }
    });
}

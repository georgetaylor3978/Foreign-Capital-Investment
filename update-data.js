const fs = require('fs');
const https = require('https');
const unzipper = require('unzipper');
const Papa = require('papaparse');

const TABLE_ID = '36100008';
const JSON_OUT = 'data.js';

async function update() {
    console.log('Fetching download link...');
    try {
        const res = await fetch(`https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/${TABLE_ID}/en`);
        const json = await res.json();
        const url = json.object;
        
        await new Promise((resolve, reject) => {
            https.get(url, (resp) => {
                resp.pipe(unzipper.Parse())
                    .on('entry', (entry) => {
                        if (entry.path.endsWith('.csv') && !entry.path.includes('MetaData')) {
                            let results = [];
                            Papa.parse(entry, {
                                header: true,
                                step: (row, parser) => {
                                    const r = row.data;
                                    const refKey = Object.keys(r).find(k => k.includes('REF_DATE')) || 'REF_DATE';
                                    const yVal = r[refKey];
                                    
                                    if (r['VALUE'] && yVal && r['GEO'] === 'Canada') {
                                        results.push({
                                            year: String(yVal),
                                            parent: r['Canadian and foreign direct investment'],
                                            child: r['Countries or regions'],
                                            value: parseFloat(r['VALUE'])
                                        });
                                    }
                                    if(results.length >= 250000) results = results.slice(50000); // safety
                                },
                                complete: () => {
                                    fs.writeFileSync(JSON_OUT, 'const rawData = ' + JSON.stringify(results) + ';');
                                    console.log('Capital Flight updated. Records: ' + results.length);
                                    resolve();
                                }
                            });
                        } else {
                            entry.autodrain();
                        }
                    }).on('error', reject).on('finish', resolve);
            }).on('error', reject);
        });
    } catch(e) { console.error(e); }
}
update();

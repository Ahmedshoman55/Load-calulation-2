// Cooling Load Calculator Logic

// --- Theme Logic ---
function initTheme() {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        document.getElementById('moonIcon').classList.add('hidden');
        document.getElementById('sunIcon').classList.remove('hidden');
    } else {
        document.documentElement.classList.remove('dark');
        document.getElementById('moonIcon').classList.remove('hidden');
        document.getElementById('sunIcon').classList.add('hidden');
    }
}
initTheme();

function toggleTheme() {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.theme = 'light';
        document.getElementById('moonIcon').classList.remove('hidden');
        document.getElementById('sunIcon').classList.add('hidden');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.theme = 'dark';
        document.getElementById('moonIcon').classList.add('hidden');
        document.getElementById('sunIcon').classList.remove('hidden');
    }
}

// --- Save/Load Project Logic ---
function saveProject() {
    const data = {};
    const inputs = document.querySelectorAll('input, select');
    inputs.forEach(input => {
        if (input.id) {
            if (input.type === 'checkbox') {
                data[input.id] = input.checked;
            } else if (input.type !== 'file') {
                data[input.id] = input.value;
            }
        }
    });

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cooling_load_project.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadProject(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            for (const [id, value] of Object.entries(data)) {
                const el = document.getElementById(id);
                if (el) {
                    if (el.type === 'checkbox') {
                        el.checked = value;
                        // Trigger toggle logic if it's a section toggle
                        if (id.startsWith('toggle')) {
                            const sectionId = 'content' + id.replace('toggle', '');
                            toggleSection(sectionId, value);
                        }
                    } else {
                        el.value = value;
                    }
                }
            }
            calculateAll(); // Recalculate after loading
            alert('Project loaded successfully!');
        } catch (err) {
            console.error(err);
            alert('Error loading project file.');
        }
    };
    reader.readAsText(file);
    // Reset input so same file can be selected again
    input.value = '';
}


// --- Logo Upload Logic ---
document.getElementById('logoUpload').addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = document.getElementById('companyLogoDisplay');
            img.src = e.target.result;
            img.classList.remove('hidden');
        }
        reader.readAsDataURL(file);
    }
});

// --- Toggle Logic ---
function toggleSection(contentId, isChecked) {
    const contentDiv = document.getElementById(contentId);
    if (!contentDiv) return;

    const inputs = contentDiv.querySelectorAll('input, select');

    if (isChecked) {
        contentDiv.classList.remove('opacity-50', 'pointer-events-none');
        inputs.forEach(input => input.disabled = false);
    } else {
        contentDiv.classList.add('opacity-50', 'pointer-events-none');
        inputs.forEach(input => input.disabled = true);
    }
}

// --- Calculation Logic ---

function getVal(id) {
    const el = document.getElementById(id);
    if (!el || el.disabled) return 0; // Return 0 if disabled
    const val = parseFloat(el.value);
    return isNaN(val) ? 0 : val;
}

function setVal(id, val) {
    document.getElementById(id).innerText = val.toFixed(3) + " kW";
}

function calculateAll() {
    // --- General Inputs ---
    const roomVol = getVal('roomVolume'); // Should not be disabled usually
    const tOut = getVal('tOutside');
    const tRoom = getVal('tRoom');
    const tGround = getVal('tGround');
    const isGroundFloor = document.getElementById('isGroundFloor').checked;

    // --- L1: Product Load ---
    let L1 = 0;
    let mass = 0;
    const useL1 = document.getElementById('toggleL1').checked;

    if (useL1) {
        const state = document.getElementById('productState').value; // 1, 2, 3
        const cpFresh = getVal('cpFresh');
        const cpFrozen = getVal('cpFrozen');
        const latentHeat = getVal('latentHeat');
        const t1 = getVal('t1');
        const t2 = getVal('t2');
        const tf = getVal('tf');
        const timeL1 = getVal('timeL1');
        const occRate = getVal('occupiedRate');
        const storeRate = getVal('storingRate');

        // Determine Density
        let density = 0;
        if (state === "1") density = 500;
        else density = 650;

        // Mass Calculation
        mass = (occRate / 100) * (storeRate / 100) * density * roomVol;

        if (timeL1 > 0) {
            if (state === "1") {
                // Fresh & Stored Fresh
                L1 = (mass / (timeL1 * 3600)) * cpFresh * (t1 - t2);
            } else if (state === "2") {
                // Fresh & Stored Frozen
                L1 = (mass / (timeL1 * 3600)) * ((cpFresh * (t1 - tf)) + latentHeat + (cpFrozen * (tf - t2)));
            } else if (state === "3") {
                // Frozen & Stored Frozen
                L1 = (mass / (timeL1 * 3600)) * cpFrozen * (t1 - t2);
            }
        }
    }

    // --- L2: Transmission Load ---
    let L2 = 0;
    let floorArea = 0; // Needed for L6 and L8
    const useL2 = document.getElementById('toggleL2').checked;

    if (useL2) {
        const rows = ['north', 'south', 'east', 'west', 'ceiling', 'floor'];
        let totalQ = 0;

        rows.forEach(row => {
            const tr = document.querySelector(`tr[data-row="${row}"]`);
            const U = parseFloat(tr.querySelector('.l2-u').value) || 0;
            const Area = parseFloat(tr.querySelector('.l2-area').value) || 0;
            const dtSolar = parseFloat(tr.querySelector('.l2-dt-solar').value) || 0;

            if (row === 'floor') floorArea = Area;

            let dtTotal = 0;
            if (row === 'floor') {
                if (isGroundFloor) {
                    dtTotal = dtSolar + (tGround - tRoom);
                } else {
                    dtTotal = dtSolar + (tOut - tRoom);
                }
            } else {
                dtTotal = dtSolar + (tOut - tRoom);
            }

            const Q = U * Area * dtTotal;
            totalQ += Q;

            // Update Row UI
            tr.querySelector('.l2-dt-total').innerText = dtTotal.toFixed(2);
            tr.querySelector('.l2-q').innerText = Q.toFixed(2);
        });

        L2 = totalQ * Math.pow(10, -3); // Convert W to kW
        document.getElementById('l2SumQ').innerText = totalQ.toFixed(2) + " W";
    } else {
        document.getElementById('l2SumQ').innerText = "-";
        // Clear row calcs
        document.querySelectorAll('.l2-dt-total, .l2-q').forEach(el => el.innerText = "-");
    }


    // --- L3: Air Change Load ---
    let L3 = 0;
    if (document.getElementById('toggleL3').checked) {
        const densOut = getVal('densityOutside');
        const airChanges = getVal('airChanges');
        const Io = getVal('enthalpyOut');
        const Ir = getVal('enthalpyRoom');

        L3 = densOut * ((airChanges * roomVol) / (24 * 3600)) * (Io - Ir);
    }

    // --- L4: Respiration Load ---
    let L4 = 0;
    if (document.getElementById('toggleL4').checked) {
        const qResp = parseFloat(document.getElementById('qRespiration').value) || 0;
        document.getElementById('qRespirationL4').value = qResp;
        L4 = mass * qResp * Math.pow(10, -3);
    }

    // --- L5: Workers Load ---
    let L5 = 0;
    if (document.getElementById('toggleL5').checked) {
        const nWorkers = getVal('numWorkers');
        const heatWorker = getVal('heatPerWorker');
        const hrsWorker = getVal('workerHours');

        L5 = nWorkers * heatWorker * (hrsWorker / 24) * Math.pow(10, -3);
    }

    // --- L6: Lighting Load ---
    let L6 = 0;
    if (document.getElementById('toggleL6').checked) {
        const lightInt = getVal('lightIntensity');
        const lightHrs = getVal('lightHours');

        L6 = lightInt * floorArea * (lightHrs / 24) * Math.pow(10, -3);
    }

    // --- L7: Machine Load ---
    let L7 = 0;
    if (document.getElementById('toggleL7').checked) {
        const power = getVal('machinePower');
        L7 = 0.7 * power;
    }

    // --- L8: Heating Load ---
    let L8 = 0;
    if (document.getElementById('toggleL8').checked) {
        const state = document.getElementById('productState').value;
        if (isGroundFloor && state !== "1") {
            L8 = 5 * floorArea * Math.pow(10, -3);
        } else {
            L8 = 0;
        }
    }

    // --- Total & RC ---
    const L_TOT = L1 + L2 + L3 + L4 + L5 + L6 + L7 + L8;

    const compHours = getVal('compressorHours');
    const safety = getVal('safetyFactor');

    let RC = 0;
    if (compHours > 0) {
        RC = L_TOT * safety * (24 / compHours);
    }

    // --- Display Results ---
    setVal('resL1', L1);
    setVal('resL2', L2);
    setVal('resL3', L3);
    setVal('resL4', L4);
    setVal('resL5', L5);
    setVal('resL6', L6);
    setVal('resL7', L7);
    setVal('resL8', L8);

    setVal('resTotal', L_TOT);
    setVal('resRC', RC);

    document.getElementById('resultsSection').classList.remove('hidden');
}

function exportToExcel() {
    // Gather all data
    const wb = XLSX.utils.book_new();

    // 1. Inputs Sheet
    const inputsData = [
        ["Parameter", "Value", "Unit"],
        ["Place Name", document.getElementById('placeName').value, ""],
        ["Freon Type", document.getElementById('freonType').value, ""],
        ["Room Volume", getVal('roomVolume'), "m³"],
        ["T_Outside", getVal('tOutside'), "°C"],
        ["T_Room", getVal('tRoom'), "°C"],
        ["Product State", document.getElementById('productState').options[document.getElementById('productState').selectedIndex].text, ""],
    ];
    const wsInputs = XLSX.utils.aoa_to_sheet(inputsData);
    XLSX.utils.book_append_sheet(wb, wsInputs, "Inputs");

    // 2. Loads Sheet
    const loadsData = [
        ["Load Component", "Value (kW)"],
        ["L1 - Product Load", document.getElementById('resL1').innerText],
        ["L2 - Transmission Load", document.getElementById('resL2').innerText],
        ["L3 - Air Change Load", document.getElementById('resL3').innerText],
        ["L4 - Respiration Load", document.getElementById('resL4').innerText],
        ["L5 - Workers Load", document.getElementById('resL5').innerText],
        ["L6 - Lighting Load", document.getElementById('resL6').innerText],
        ["L7 - Machine Load", document.getElementById('resL7').innerText],
        ["L8 - Heating Load", document.getElementById('resL8').innerText],
        ["", ""],
        ["TOTAL LOAD", document.getElementById('resTotal').innerText],
        ["REQUIRED CAPACITY (RC)", document.getElementById('resRC').innerText]
    ];
    const wsLoads = XLSX.utils.aoa_to_sheet(loadsData);
    XLSX.utils.book_append_sheet(wb, wsLoads, "Results");

    // Save
    XLSX.writeFile(wb, "Cooling_Load_Report.xlsx");
}

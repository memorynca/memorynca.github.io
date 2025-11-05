const imageCanvas = document.getElementById('imageCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const imageCtx = imageCanvas.getContext('2d');
const overlayCtx = overlayCanvas.getContext('2d');

const cols = 32;
const rows = 16;
const tileSize = 16;
const padding = 3;

const baseImage = new Image();
baseImage.src = '512n_tiny.png';
baseImage.onload = () => {
    imageCtx.drawImage(baseImage, 0, 0);
};

function drawOverlay(rule) {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    overlayCtx.font = '16px monospace';
    overlayCtx.textAlign = 'center';
    overlayCtx.textBaseline = 'middle';

    for (let i = 0; i < 512; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const bit = rule[i];

        const x = col * (tileSize + padding);
        const y = row * (tileSize + padding);

        overlayCtx.fillStyle = bit === '1' ? 'rgba(0, 255, 0, 0.25)' : 'rgba(255, 0, 0, 0.25)';
        overlayCtx.fillRect(x, y, tileSize, tileSize);
    }
}

overlayCanvas.addEventListener('dblclick', (e) => {
    const rect = overlayCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const col = Math.floor(x / (tileSize + padding));
    const row = Math.floor(y / (tileSize + padding));

    if (col >= 0 && col < cols && row >= 0 && row < rows) {
        const index = row * cols + col;
        let code = CA.code;
        if (code[index] === '1') {
            code = code.substring(0, index) + '0' + code.substring(index + 1);
        } else {
            code = code.substring(0, index) + '1' + code.substring(index + 1);
        }
        load_CA(code);
    }
});

// WebGL and CA logic
const canvas = document.getElementById('c');
const glsl = SwissGL(canvas);

let lastDrawTime = 0;
let CAs;
let CA = null;
let CA_state;
let frame_count = 0;

const params = {
    rule: "Rule B (NCA rule 290)",
    grid_size: 100,
    run_ca: true,
    steps_per_frame: -1,
};

const uniforms = {
    init_bit: 0,
    brush_bit: 1,
    noise_prob: 0.1,
    noise_bias: 0.0,
    update_prob: 1.0,
    brush_size: 0.15,
    mouse_x: 0.0,
    mouse_y: 0.0,
    mouse_down: false,
};

// UI Event Handlers
function setupUIControls() {
    // Grid size slider
    const gridSizeSlider = document.getElementById('grid-size');
    const gridSizeValue = document.getElementById('grid-size-value');
    gridSizeSlider.addEventListener('input', (e) => {
        params.grid_size = parseInt(e.target.value);
        gridSizeValue.textContent = e.target.value;
        reset_state();
    });

    // Run CA toggle
    play_pause_event = () => {
        document.getElementById("play").style.display = params.run_ca ? "inline" : "none";
        document.getElementById("pause").style.display = !params.run_ca ? "inline" : "none";
        params.run_ca = !params.run_ca;
    }
    document.getElementById('play').addEventListener("click", play_pause_event);
    document.getElementById('pause').addEventListener("click", play_pause_event);


    const initBitSelect = document.getElementById("init-bit-select");
    initBitSelect.querySelectorAll("input").forEach((sel, i) => {
        sel.onchange = () => {
            uniforms.init_bit = (i != 2) ? i : -1; // -1 for random initialization
            reset_state();
        }
    });

    const brushBitSelect = document.getElementById("brush-bit-select");
    brushBitSelect.querySelectorAll("input").forEach((sel, i) => {
        sel.onchange = () => {
            uniforms.brush_bit = (i != 2) ? i : -1; // -1 for random brush
        }
    });

    const brushSizeSelect = document.getElementById("brush-size-select");
    brushSizeSelect.querySelectorAll("input").forEach((sel, i) => {
        sel.onchange = () => {
            uniforms.brush_size = [0.05, 0.15, 0.3][i];
        }
    });


    // Sliders
    const sliders = [
        {id: 'noise-prob', param: 'noise_prob', uniform: true},
        {id: 'noise-bias', param: 'noise_bias', uniform: true},
        {id: 'update-prob', param: 'update_prob', uniform: true},
        {id: 'spf', param: 'steps_per_frame', uniform: false}
    ];

    sliders.forEach(({id, param, uniform}) => {
        const slider = document.getElementById(id);
        const valueDisplay = document.getElementById(id + '-value');

        slider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (uniform) {
                uniforms[param] = value;
            } else {
                params[param] = value;
            }

            if (id === 'spf') {
                valueDisplay.textContent = ['1/60x', '1/30x', '1/10x', '1/3x', '1x', '2x', '4x', '8x', '16x'][parseInt(e.target.value) + 4];
            } else {
                valueDisplay.textContent = value;
            }
        });
    });

    // Rule selection
    const ruleSelect = document.getElementById('rule-select');
    ruleSelect.addEventListener('change', (e) => {
        params.rule = e.target.value;
        CA = load_CA(CAs[e.target.value].code);
    });
}

async function init() {
    const response = await fetch("ca_rules.json");
    CAs = await response.json();

    // Populate rule select
    const ruleSelect = document.getElementById('rule-select');
    ruleSelect.innerHTML = '';
    Object.keys(CAs).forEach(ruleName => {
        const option = document.createElement('option');
        option.value = ruleName;
        option.textContent = CAs[ruleName].name || ruleName;
        ruleSelect.appendChild(option);
        if (ruleName === params.rule) {
            ruleSelect.value = ruleName;
        }
    });

    CA = load_CA(CAs[params.rule].code);
    reset_state();
    setupUIControls();
    render();
}

// Add functionality to add a new CA rule
document.getElementById('add_rule').addEventListener('click', () => {
    const rule_name = document.getElementById('rule_name').value;
    const rule_code = document.getElementById('rule_code').value.replace(/\s/g, "");
    if (rule_name && rule_code && rule_code.length === 512 && /^[01]+$/.test(rule_code)) {
        CAs[rule_name] = {name: rule_name, code: rule_code};

        // Update rule select
        const ruleSelect = document.getElementById('rule-select');
        const option = document.createElement('option');
        option.value = rule_name;
        option.textContent = rule_name;
        ruleSelect.appendChild(option);
        ruleSelect.value = rule_name;

        params.rule = rule_name;
        CA = load_CA(CAs[rule_name].code);

        // Clear input fields
        document.getElementById('rule_name').value = '';
        document.getElementById('rule_code').value = '';
    } else {
        alert("Please enter a valid rule name and a 512-bit binary code.");
    }
});

function load_CA(code) {
    binary_code = Float32Array.from(code, (c) => c === '1' ? 1.0 : 0.0)
    CA = {
        code: code,
        binary_code: binary_code,
        rule_bits: glsl({}, {
            size: [1, 512],
            format: "r32f",
            story: 1,
            tag: "rule",
            data: binary_code
        }),
    }
    drawOverlay(code);
    document.getElementById('current_rule').textContent = code;
    return CA;
}

function brush() {
    glsl({
        ...uniforms,
        seed: Math.random() * 5132,
        FP: `
                    float d = distance(UV, vec2(mouse_x, mouse_y));
                    if (d < brush_size) {
                        if (brush_bit == -1.0) {
                            float b = hash(ivec3(I, seed)).x;
                            FOut = vec4(b < 0.5 ? 1.0: 0.0);
                        } else if (brush_bit == 1.0) {
                            FOut = vec4(1);
                        } else {
                            FOut = vec4(0);
                        }
                    } else {
                        FOut = Src(I);
                    }
                `
    }, CA_state);
}

function reset_CA() {
    CA = load_CA(CAs[params.rule].code);
}

function reset_state() {
    CA_state = glsl({
        seed: Math.random() * 1000, ...uniforms,
        FP: `
                    if (init_bit == -1.0) {
                        float b = hash(ivec3(I, seed)).x;
                        FOut = vec4(b < 0.5 ? 1.0: 0.0);
                    } else if (init_bit == 1.0) {
                        FOut = vec4(1);
                    } else {
                        FOut = vec4(0);
                    }
                `
    }, {size: [params.grid_size, params.grid_size], format: 'r16f', story: 2, tag: 'state'});
}

// Reset Button
document.getElementById('reset_state').addEventListener('click', () => {
    reset_state();
});

document.getElementById('reset_CA').addEventListener('click', () => {
    reset_CA();
});

// Mouse click
canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (e.button === 0) {
        uniforms.mouse_down = true;
        uniforms.mouse_x = e.offsetX / canvas.width;
        uniforms.mouse_y = 1.0 - e.offsetY / canvas.height;
        brush();
    }
});
canvas.addEventListener('mouseup', (e) => {
    e.preventDefault();
    if (e.button === 0) {
        uniforms.mouse_down = false;
    }
});
canvas.addEventListener('mousemove', (e) => {
    e.preventDefault();
    uniforms.mouse_x = e.offsetX / canvas.width;
    uniforms.mouse_y = 1.0 - e.offsetY / canvas.height;
    if (uniforms.mouse_down) {
        brush();
    }
});

// Touch events
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    uniforms.mouse_down = true;
});
canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    uniforms.mouse_down = false;
});
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    // uniforms.mouse_x = touch.clientX / canvas.width;
    // uniforms.mouse_y = 1.0 - touch.clientY / canvas.height;
    // This is wrong. clientX is not relative to the canvas
    const rect = canvas.getBoundingClientRect();
    uniforms.mouse_x = (touch.clientX - rect.left) / canvas.width;
    uniforms.mouse_y = 1.0 - (touch.clientY - rect.top) / canvas.height;
    if (uniforms.mouse_down) {
        brush();
    }
});

function step(t) {
    if (!params.run_ca) return;

    glsl({
        ...uniforms,
        rule: CA.rule_bits[0],
        seed: t + Math.random() * 6523,
        FP: `
                    float s = Src(I).x;
                    float p = 1.0;
                    float res = 0.0;
                    bool update_flag = hash(ivec3(I, seed)).x < update_prob;

                    if (!update_flag) {
                        FOut = vec4(s);
                        return;
                    }

                    bool noise_flag = hash(ivec3(I, seed + 1231.0)).x < noise_prob;
                    if (noise_flag) {
                        bool bias_flag = (hash(ivec3(I, seed + 7861.0)).x - 0.5) * 2.0 < noise_bias;
                        if (bias_flag) {
                            FOut = vec4(1.0);
                        } else  {
                            FOut = vec4(0.0);
                        }
                    } else {
                        for (int i = -1; i < 2; i++) {
                            for (int j = -1; j < 2; j++) {
                                ivec2 pos = (I + ivec2(i,j)+ViewSize)%ViewSize;
                                res += Src(pos).x * p;
                                p *= 2.0;
                            }
                        }
                        float s_next = rule(ivec2(0, int(res))).x;
                        FOut = vec4(s_next);
                    }
                `
    }, CA_state);
}

function render(t) {
    if (!CA) return;

    frame_count++;
    let spf = params.steps_per_frame;
    let steps = 1;
    if (spf <= 0) {
        const skip = [1, 3, 10, 30, 60][-spf]
        steps = (frame_count % skip) ? 0 : 1;
    } else {
        steps = [1, 2, 4, 8, 16][spf]
    }

    for (let i = 0; i < steps; i++) {
        step(t);
    }
    glsl({
        state: CA_state[0].nearest,
        FP: `vec4(vec3(1.0 - state(UV).x)*0.5+0.25,1)`
    });
    requestAnimationFrame(render);
}

init();

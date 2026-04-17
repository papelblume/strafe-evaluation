import { createSignal, onMount, createEffect, onCleanup, For, createMemo } from "solid-js";
import "./App.css";
import { Chart, registerables } from 'chart.js';
import { Bar } from 'solid-chartjs';
import { listen } from '@tauri-apps/api/event';

function draw_time(time) {
  if (time < 0) return "-" + Math.abs(time).toFixed(0) + " ms";
  return time.toFixed(0) + " ms";
}

function getMeanAndVar(arr) {
  if (arr.length === 0) return { average: 0, std_deviation: 0 };
  const sum = arr.reduce((pre, cur) => pre + cur);
  const num = arr.length;
  const average = sum / num;
  let variance = 0;
  arr.forEach(n => { variance += (n - average) ** 2; });
  variance /= num;
  return { average, std_deviation: Math.sqrt(variance) };
}

function getStats(duration_array) {
  if (duration_array.length < 1) return { median: 0, min: 0, max: 0, average: 0, std_deviation: 0, samples: 0 };
  const absValues = duration_array.map(Math.abs);
  const sorted = [...absValues].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  const o = getMeanAndVar(absValues);
  return { median, min: sorted[0], max: sorted[sorted.length - 1], average: o.average, std_deviation: o.std_deviation, samples: duration_array.length };
}

function getOccurance(duration_array, binSize = 5) {
  if (!duration_array || duration_array.length === 0) return new Array(61).fill(0);
  const out = new Array(61).fill(0);
  duration_array.forEach(x => {
    const bin = Math.round(x / binSize);
    const index = 20 + bin;
    if (index >= 0 && index < 61) out[index] += 1;
  });
  return out;
}

function StrafePill(props) {
  const colorMap = {
    Early: "#f16a5c",
    Perfect: "#34d27a",
    Late: "#f7b46f"
  };
  return (
    <div className="flex-shrink-0 shadow-md select-none flex flex-col border border-dark/30 dark:border-bright/30 border-t bg-secondary/45 dark:bg-secondary/40 rounded-md justify-center items-center min-w-[68px] px-2 py-1">
      <p className="font-bold text-center text-sm" style={{ color: colorMap[props.type] }}>{props.type}</p>
      <p className="text-center text-sm">{draw_time(props.duration)}</p>
    </div>
  );
}

function StatRow(props) {
  return (
    <tr>
      <th className="px-4">{props.label}</th>
      <td className="px-3 text-center">{draw_time(props.alls)}</td>
      <td className="px-3 text-center">{draw_time(props.early)}</td>
      <td className="px-3 text-center">{draw_time(props.perfect)}</td>
      <td className="px-3 text-center">{draw_time(props.late)}</td>
    </tr>
  );
}

function StatsTable(props) {
  const total = () => props.alls.samples;
  const p = (n) => total() > 0 ? Math.round((n / total()) * 100) : 0;

  return (
    <table style="width:100%">
      <tbody className="text-center">
        <tr>
          <th className="px-4"></th>
          <th className="w-20 px-3">All</th>
          <th className="w-20 px-3">Early</th>
          <th className="w-20 px-3">Perfect</th>
          <th className="w-20 px-3">Late</th>
        </tr>
        <StatRow label="Median" alls={props.alls.median} early={props.early.median} perfect={props.perfect.median} late={props.late.median} />
        <StatRow label="Average" alls={props.alls.average} early={props.early.average} perfect={props.perfect.average} late={props.late.average} />
        <StatRow label="Min" alls={props.alls.min} early={props.early.min} perfect={props.perfect.min} late={props.late.min} />
        <StatRow label="Max" alls={props.alls.max} early={props.early.max} perfect={props.perfect.max} late={props.late.max} />
        <StatRow label="Std. Deviation" alls={props.alls.std_deviation} early={props.early.std_deviation} perfect={props.perfect.std_deviation} late={props.late.std_deviation} />
        <tr>
          <th className="px-4">Samples</th>
          <td className="px-3">{props.alls.samples}</td>
          <td className="px-3">{props.early.samples}</td>
          <td className="px-3">{props.perfect.samples}</td>
          <td className="px-3">{props.late.samples}</td>
        </tr>
        <tr className="font-medium border-t border-dark/30 dark:border-bright/30">
          <th className="px-4">%</th>
          <td className="px-3 text-dark/70 dark:text-bright/70">-</td>
          <td className="px-3">{p(props.early.samples)}%</td>
          <td className="px-3">{p(props.perfect.samples)}%</td>
          <td className="px-3">{p(props.late.samples)}%</td>
        </tr>
        <tr className="font-medium border-t border-dark/30 dark:border-bright/30 bg-secondary/30 dark:bg-secondary/40">
          <th className="px-4">Fired (LMB)</th>
          <td className="px-3">{props.lmbFired.samples}</td>
          <td className="px-3">{p(props.lmbFired.early)}%</td>
          <td className="px-3">{p(props.lmbFired.perfect)}%</td>
          <td className="px-3">{p(props.lmbFired.late)}%</td>
        </tr>
      </tbody>
    </table>
  );
}

const MyChart = (props) => {
  const binSize = 5;
  const labels = createMemo(() => Array.from({ length: 61 }, (_, i) => (i - 20) * binSize));

  const [chartData, setChartData] = createSignal({
    labels: labels(),
    datasets: [
      { label: 'Early', data: [], borderRadius: 5, backgroundColor: "#f16a5c" },
      { label: 'Perfect', data: [], borderRadius: 5, backgroundColor: "#34d27a" },
      { label: 'Late', data: [], borderRadius: 5, backgroundColor: "#f7b46f" },
    ],
  });

  onMount(() => Chart.register(...registerables));

  createEffect(() => {
    setChartData({
      labels: labels(),
      datasets: [
        { label: 'Early', data: getOccurance(props.earlyStrafes, binSize), borderRadius: 5, backgroundColor: "#f16a5c" },
        { label: 'Perfect', data: getOccurance(props.perfectStrafes, binSize), borderRadius: 5, backgroundColor: "#34d27a" },
        { label: 'Late', data: getOccurance(props.lateStrafes, binSize), borderRadius: 5, backgroundColor: "#f7b46f" },
      ],
    });
  });

  const chartOptions = createMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { stacked: true, ticks: { color: 'var(--chart-text)', font: { size: 12 } }, grid: { color: 'var(--chart-grid)' } },
      y: { stacked: true, ticks: { color: 'var(--chart-text)', font: { size: 12 } }, grid: { color: 'var(--chart-grid)' } }
    },
    plugins: { legend: { labels: { color: 'var(--chart-text)' } } }
  }));

  return <Bar data={chartData()} options={chartOptions()} />;
};

function WASD() {
  const [aPressed, setAPressed] = createSignal(false);
  const [dPressed, setDPressed] = createSignal(false);

  createEffect(() => {
    let unlistenA, unlistenD, unlistenReleaseA, unlistenReleaseD;
    const setupListeners = async () => {
      unlistenA = await listen('a-pressed', () => setAPressed(true));
      unlistenD = await listen('d-pressed', () => setDPressed(true));
      unlistenReleaseA = await listen('a-released', () => setAPressed(false));
      unlistenReleaseD = await listen('d-released', () => setDPressed(false));
    };
    onCleanup(() => {
      if (typeof unlistenA === "function") unlistenA();
      if (typeof unlistenD === "function") unlistenD();
      if (typeof unlistenReleaseA === "function") unlistenReleaseA();
      if (typeof unlistenReleaseD === "function") unlistenReleaseD();
    });
    setupListeners();
  });

  async function simulateEarly() { setAPressed(true); setTimeout(() => setDPressed(true), 500); setTimeout(() => setAPressed(false), 850); setTimeout(() => setDPressed(false), 1350); }
  async function simulateLate() { setAPressed(true); setTimeout(() => setAPressed(false), 500); setTimeout(() => setDPressed(true), 850); setTimeout(() => setDPressed(false), 1350); }
  async function simulatePerfect() { const delay = 40; setAPressed(true); setTimeout(() => setAPressed(false), 500); setTimeout(() => setDPressed(true), 500 + delay); setTimeout(() => setDPressed(false), 1000 + delay); }

  return (
    <div className="flex group justify-center items-center w-full h-full">
      <div className="flex flex-col basis-0 flex-grow items-end opacity-0 -translate-x-2 duration-200 group-hover:opacity-100 group-hover:translate-x-0">
		<button className="wasd-button text-white" style={{ backgroundColor: props.colorMap.Early }} onClick={simulateEarly}>Early</button>
		<button className="wasd-button text-white" style={{ backgroundColor: props.colorMap.Late }} onClick={simulateLate}>Late</button>
		<button className="wasd-button text-white" style={{ backgroundColor: props.colorMap.Perfect }} onClick={simulatePerfect}>Perfect</button>
      </div>
      <div className="flex justify-center basis-0 flex-grow">
        <div className="select-none pointer-events-none text-dark dark:text-bright flex justify-between w-40 text-center font-bold text-xl">
          <div className={`flex border border-dark/20 dark:border-bright/20 border-r border-b shadow-lg border-b-dark/50 dark:border-b-bright/50 w-16 h-16 rounded-md justify-center items-center duration-75 transition-all ${aPressed() ? "bg-accent/70 scale-100 translate-y-[4px]" : "bg-secondary/10 dark:bg-secondary/20"}`}>
            <p>A</p>
          </div>
          <div className={`flex border border-dark/20 dark:border-bright/20 border-l border-b shadow-lg border-b-dark/50 dark:border-b-bright/50 w-16 h-16 rounded-md justify-center items-center duration-75 transition-all ${dPressed() ? "bg-accent/70 translate-y-[4px]" : "bg-secondary/10 dark:bg-secondary/20"}`}>
            <p>D</p>
          </div>
        </div>
      </div>
      <div className="basis-0 flex-grow min-w-[200px]"></div>
    </div>
  );
}

function App() {
  const [allStrafes, setAllStrafes] = createSignal([]);

  const [countOnlyLMB, setCountOnlyLMB] = createSignal(false);
  const [isDark, setIsDark] = createSignal(false);
  const [soundEnabled, setSoundEnabled] = createSignal({ Early: true, Perfect: true, Late: true });
  const [volume, setVolume] = createSignal(0.6);

  const colorMap = {
    Early: "#f16a5c",
    Perfect: "#34d27a",
    Late: "#f7b46f"
  };
  
  let audioContext;

  onMount(() => {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Load saved settings from localStorage
    const savedVolume = localStorage.getItem('volume');
    if (savedVolume) setVolume(parseFloat(savedVolume));

    const savedRequireLMB = localStorage.getItem('requireLMB');
    if (savedRequireLMB !== null) setCountOnlyLMB(savedRequireLMB === 'true');

    const savedSound = localStorage.getItem('soundEnabled');
    if (savedSound) {
      try { setSoundEnabled(JSON.parse(savedSound)); } catch(e) {}
    }

    const saved = localStorage.getItem('theme');
    if (saved) setIsDark(saved === 'dark');
    else setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  // Save to localStorage whenever values change
  createEffect(() => { localStorage.setItem('volume', volume().toString()); });
  createEffect(() => { localStorage.setItem('requireLMB', countOnlyLMB().toString()); });
  createEffect(() => { localStorage.setItem('soundEnabled', JSON.stringify(soundEnabled())); });

  createEffect(() => {
    if (isDark()) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  });

  const playBeep = (type) => {
    if (!soundEnabled()[type] || !audioContext) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain).connect(audioContext.destination);
    
    const frequency = type === "Perfect" ? 880 : type === "Early" ? 220 : 440;
    osc.frequency.setValueAtTime(frequency, audioContext.currentTime);
    
    gain.gain.value = volume();
    osc.start();
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.15);
    osc.stop(audioContext.currentTime + 0.2);
  };

  const toggleTheme = () => setIsDark(prev => !prev);

  function resetStrafes() {
    setAllStrafes([]);
  }

  // Listen for strafes from Tauri backend
  createEffect(() => {
    let unlisten;
    const setup = async () => {
      unlisten = await listen('strafe', (event) => {
        const { strafe_type: type, duration, lmb_pressed } = event.payload;
        const finalDuration = type === "Early" ? -duration : duration;
        const strafeObj = { type, duration: finalDuration, lmb_pressed };

        const shouldCount = !countOnlyLMB() || lmb_pressed;

        if (shouldCount) {
          setAllStrafes(prev => [strafeObj, ...prev]);
          playBeep(type);
        }
      });
    };
    setup();
    onCleanup(() => unlisten?.());
  });

  const allStats = createMemo(() => {
    const allDurations = allStrafes().map(s => s.duration);
    const earlyDurations = allStrafes().filter(s => s.type === "Early").map(s => s.duration);
    const perfectDurations = allStrafes().filter(s => s.type === "Perfect").map(s => s.duration);
    const lateDurations = allStrafes().filter(s => s.type === "Late").map(s => s.duration);

    return {
      alls: getStats(allDurations),
      early: getStats(earlyDurations),
      perfect: getStats(perfectDurations),
      late: getStats(lateDurations)
    };
  });

  const lmbFired = createMemo(() => {
    const earlyLMB = allStrafes().filter(s => s.type === "Early" && s.lmb_pressed).length;
    const perfectLMB = allStrafes().filter(s => s.type === "Perfect" && s.lmb_pressed).length;
    const lateLMB = allStrafes().filter(s => s.type === "Late" && s.lmb_pressed).length;

    return {
      samples: earlyLMB + perfectLMB + lateLMB,
      early: earlyLMB,
      perfect: perfectLMB,
      late: lateLMB
    };
  });

  const recentStrafes = createMemo(() => allStrafes().slice(0, 100));

  return (
    <div class="w-screen h-screen bg-bright dark:bg-dark text-dark dark:text-bright flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-3 select-none">
        {/* Left: Title */}
        <div className="flex items-center">
          <h1 className="mr-3 drop-shadow-lg py-2 text-4xl pointer-events-none font-bold text-center text-dark dark:text-bright text-stroke italic">
            PatrikZero's
          </h1>
          <h1 className="py-2 text-4xl font-bold text-center pointer-events-none">
            Strafe Evaluation
          </h1>
        </div>

        {/* Center: Controls */}
        <div className="flex flex-col items-center gap-3 flex-1 max-w-md">
          {/* Row 1: Volume + Require LMB */}
          <div className="flex items-center gap-6 justify-center">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-dark/70 dark:text-bright/70 whitespace-nowrap">Vol:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume()}
                onInput={(e) => setVolume(parseFloat(e.target.value))}
                className="w-28 accent-primary"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none text-sm group relative">
              <input
                type="checkbox"
                checked={countOnlyLMB()}
                onChange={(e) => setCountOnlyLMB(e.target.checked)}
                className="w-5 h-5 accent-primary cursor-pointer"
              />
              <span className="font-medium whitespace-nowrap">Require LMB</span>
              
              {/* Tooltip - positioned below to stay inside window */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block bg-dark dark:bg-bright text-bright dark:text-dark text-xs px-3 py-1.5 rounded shadow-lg whitespace-nowrap z-50 pointer-events-none">
                Only count strafes if Left Mouse Button is pressed during the strafe
              </div>
            </label>
          </div>

          {/* Row 2: Sound checkboxes with speaker emoji */}
          <div className="flex gap-4 text-xs items-center">
            <span className="font-medium text-dark/70 dark:text-bright/70 whitespace-nowrap">Sound:</span>
            {Object.keys(soundEnabled()).map((t) => (
              <label key={t} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={soundEnabled()[t]}
                  onChange={(e) => setSoundEnabled((prev) => ({ ...prev, [t]: e.target.checked }))}
                />
                <span 
                  className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
                  onClick={() => playBeep(t)}
                >
                  {t} 🔊
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Right: Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="px-6 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-medium shadow-md flex items-center gap-2 transition-all active:scale-95 whitespace-nowrap"
        >
          {isDark() ? '☀️ Bright Mode' : '🌙 Dark Mode'}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-grow p-3 gap-4 overflow-hidden">   

        {/* Statistics + Chart Row */}
        <div className="flex gap-4 flex-1 min-h-0">   

          {/* Statistics Panel */}
          <div className="flex flex-col w-[50%] rounded-xl border border-white/30 dark:border-white/10 p-4 
                          bg-secondary/50 dark:bg-secondary/30 shadow-xl 
                          max-h-[420px]">   
            <div className="flex justify-between mb-4">
              <h2 className="select-none text-2xl font-bold">Statistics</h2>
              <button onClick={resetStrafes} className="text-bright select-none shadow-md px-5 py-1 rounded-md bg-primary hover:scale-110 active:scale-95 transition-all">Reset</button>
            </div>
            <div className="flex-1 overflow-auto">
              <StatsTable
                alls={allStats().alls}
                early={allStats().early}
                perfect={allStats().perfect}
                late={allStats().late}
                lmbFired={lmbFired()}
              />
            </div>
          </div>

          {/* Chart Panel - now fills completely */}
          <div className="flex flex-col w-[50%] bg-secondary/30 dark:bg-secondary/20 rounded-xl p-4 shadow-xl 
                          max-h-[420px] flex-1">
            <div className="flex-1 min-h-0 w-full">
              <MyChart
                earlyStrafes={allStrafes().filter(s => s.type === "Early").map(s => s.duration)}
                perfectStrafes={allStrafes().filter(s => s.type === "Perfect").map(s => s.duration)}
                lateStrafes={allStrafes().filter(s => s.type === "Late").map(s => s.duration)}
              />
            </div>
          </div>
        </div>

        {/* WASD Visualizer */}
        <div className="h-32 flex-shrink-0 flex items-center justify-center">
          <WASD />
        </div>

        {/* History Bar */}
        <div className="h-[100px] flex-shrink-0 flex flex-row p-3 bg-accent/25 dark:bg-accent/20 overflow-x-auto w-full gap-3 scrollbar-hide">
          <For each={recentStrafes()}>
            {(strafe) => (
              <StrafePill type={strafe.type} duration={strafe.duration} />
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

export default App;

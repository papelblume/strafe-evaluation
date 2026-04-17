import { createSignal, onMount, createEffect, onCleanup, For, createMemo, batch } from "solid-js";
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
  if (!duration_array || duration_array.length === 0) return new Array(81).fill(0);
  const out = new Array(81).fill(0);
  duration_array.forEach(x => {
    const bin = Math.round(x / binSize);
    const index = 40 + bin;
    if (index >= 0 && index < 81) out[index] += 1;
  });
  return out;
}

function StrafePill(props) {
  const colorMap = {
    Early: "#f16a5c",
    Good: "#95d26f",
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
      <th>{props.label}</th>
      <td>{draw_time(props.alls)}</td>
      <td>{draw_time(props.early)}</td>
      <td>{draw_time(props.good)}</td>
      <td>{draw_time(props.perfect)}</td>
      <td>{draw_time(props.late)}</td>
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
          <th></th>
          <th className="w-16">All</th>
          <th className="w-16">Early</th>
          <th className="w-16">Good</th>
          <th className="w-16">Perfect</th>
          <th className="w-16">Late</th>
        </tr>
        <StatRow label="Median" alls={props.alls.median} early={props.early.median} good={props.good.median} perfect={props.perfect.median} late={props.late.median} />
        <StatRow label="Average" alls={props.alls.average} early={props.early.average} good={props.good.average} perfect={props.perfect.average} late={props.late.average} />
        <StatRow label="Min" alls={props.alls.min} early={props.early.min} good={props.good.min} perfect={props.perfect.min} late={props.late.min} />
        <StatRow label="Max" alls={props.alls.max} early={props.early.max} good={props.good.max} perfect={props.perfect.max} late={props.late.max} />
        <StatRow label="Std. Deviation" alls={props.alls.std_deviation} early={props.early.std_deviation} good={props.good.std_deviation} perfect={props.perfect.std_deviation} late={props.late.std_deviation} />
        <tr>
          <th>Samples</th>
          <td>{props.alls.samples}</td>
          <td>{props.early.samples}</td>
          <td>{props.good.samples}</td>
          <td>{props.perfect.samples}</td>
          <td>{props.late.samples}</td>
        </tr>
        <tr className="font-medium border-t border-dark/30 dark:border-bright/30">
          <th>%</th>
          <td className="text-bright/70">-</td>
          <td>{p(props.early.samples)}%</td>
          <td>{p(props.good.samples)}%</td>
          <td>{p(props.perfect.samples)}%</td>
          <td>{p(props.late.samples)}%</td>
        </tr>
        <tr className="font-medium border-t border-dark/30 dark:border-bright/30 bg-secondary/20 dark:bg-secondary/30">
          <th>Fired (LMB)</th>
          <td>{props.lmbFired.samples}</td>
          <td>{p(props.lmbFired.early)}%</td>
          <td>{p(props.lmbFired.good)}%</td>
          <td>{p(props.lmbFired.perfect)}%</td>
          <td>{p(props.lmbFired.late)}%</td>
        </tr>
      </tbody>
    </table>
  );
}

const MyChart = (props) => {
  const binSize = 5;
  const labels = createMemo(() => Array.from({ length: 81 }, (_, i) => (i - 40) * binSize));

  const [chartData, setChartData] = createSignal({
    labels: labels(),
    datasets: [
      { label: 'Early', data: [], borderRadius: 5, backgroundColor: "#f16a5c" },
      { label: 'Good', data: [], borderRadius: 5, backgroundColor: "#95d26f" },
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
        { label: 'Good', data: getOccurance(props.goodStrafes, binSize), borderRadius: 5, backgroundColor: "#95d26f" },
        { label: 'Perfect', data: getOccurance(props.perfectStrafes, binSize), borderRadius: 5, backgroundColor: "#34d27a" },
        { label: 'Late', data: getOccurance(props.lateStrafes, binSize), borderRadius: 5, backgroundColor: "#f7b46f" },
      ],
    });
  });

  const chartOptions = createMemo(() => ({
    responsive: true,
    maintainAspectRatio: true,
    scales: {
      x: { stacked: true, ticks: { color: 'var(--chart-text)', font: { size: 12 } }, grid: { color: 'var(--chart-grid)' } },
      y: { stacked: true, ticks: { color: 'var(--chart-text)', font: { size: 12 } }, grid: { color: 'var(--chart-grid)' } }
    },
    plugins: { legend: { labels: { color: 'var(--chart-text)' } } }
  }));

  return <Bar data={chartData()} options={chartOptions()} width={4} height={3} />;
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
  async function simulatePerfect() { const delay = 20; setAPressed(true); setTimeout(() => setAPressed(false), 500); setTimeout(() => setDPressed(true), 500 + delay); setTimeout(() => setDPressed(false), 1000 + delay); }
  async function simulateGood() { const delay = 60; setAPressed(true); setTimeout(() => setAPressed(false), 500); setTimeout(() => setDPressed(true), 500 + delay); setTimeout(() => setDPressed(false), 1000 + delay); }

  return (
    <div className="flex group justify-center items-center w-full h-full">
      <div className="flex flex-col basis-0 flex-grow items-end opacity-0 -translate-x-2 duration-200 group-hover:opacity-100 group-hover:translate-x-0">
        <button className="wasd-button text-white bg-secondary" onClick={simulateEarly}>Early</button>
        <button className="wasd-button text-white bg-accent" onClick={simulateLate}>Late</button>
        <button className="wasd-button text-white bg-[#b5ac8c]" onClick={simulatePerfect}>Perfect</button>
        <button className="wasd-button text-white bg-[#b5ac8c]" onClick={simulateGood}>Good</button>
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
  const [soundEnabled, setSoundEnabled] = createSignal({ Early: true, Good: true, Perfect: true, Late: true });
  const [volume, setVolume] = createSignal(0.6);

  const colorMap = {
    Early: "#f16a5c",
    Good: "#95d26f",
    Perfect: "#34d27a",
    Late: "#f7b46f"
  };
  
  let audioContext;
  onMount(() => {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const saved = localStorage.getItem('theme');
    if (saved) setIsDark(saved === 'dark');
    else setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

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
    osc.frequency.setValueAtTime(type === "Perfect" ? 880 : type === "Good" ? 660 : type === "Early" ? 440 : 220, audioContext.currentTime);
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

        const shouldCount = !countOnlyLMB() || lmb_pressed || type === "Perfect" || type === "Good";

        if (shouldCount) {
          setAllStrafes(prev => [strafeObj, ...prev]); // Most recent first
          playBeep(type);
        }
      });
    };
    setup();
    onCleanup(() => unlisten?.());
  });

  // Statistics
  const allStats = createMemo(() => {
    const allDurations = allStrafes().map(s => s.duration);
    const earlyDurations = allStrafes().filter(s => s.type === "Early").map(s => s.duration);
    const goodDurations = allStrafes().filter(s => s.type === "Good").map(s => s.duration);
    const perfectDurations = allStrafes().filter(s => s.type === "Perfect").map(s => s.duration);
    const lateDurations = allStrafes().filter(s => s.type === "Late").map(s => s.duration);

    return {
      alls: getStats(allDurations),
      early: getStats(earlyDurations),
      good: getStats(goodDurations),
      perfect: getStats(perfectDurations),
      late: getStats(lateDurations)
    };
  });

  const lmbFired = createMemo(() => {
    const earlyLMB = allStrafes().filter(s => s.type === "Early" && s.lmb_pressed).length;
    const goodLMB = allStrafes().filter(s => s.type === "Good" && s.lmb_pressed).length;
    const perfectLMB = allStrafes().filter(s => s.type === "Perfect" && s.lmb_pressed).length;
    const lateLMB = allStrafes().filter(s => s.type === "Late" && s.lmb_pressed).length;

    return {
      samples: earlyLMB + goodLMB + perfectLMB + lateLMB,
      early: earlyLMB,
      good: goodLMB,
      perfect: perfectLMB,
      late: lateLMB
    };
  });

  // Most recent 100 strafes (chronological order preserved)
  const recentStrafes = createMemo(() => {
    return allStrafes().slice(0, 100);
  });

  return (
{/* Main Content - Shorter Panels */}
<div className="flex flex-grow flex-col p-3 gap-4 overflow-hidden">
  {/* Top Row: Statistics + Chart (now shorter) */}
  <div className="flex gap-4 flex-1 min-h-0">  {/* min-h-0 is important for flex children to shrink */}
    
    {/* Statistics Panel - Shorter */}
    <div className="flex flex-col rounded-xl border border-white/30 dark:border-white/10 p-4 
                    w-[50%] bg-secondary/50 dark:bg-secondary/30 shadow-xl 
                    h-fit max-h-[45vh]">   {/* ← This controls the height */}
      <div className="flex justify-between mb-3">
        <h2 className="select-none text-2xl font-bold">Statistics</h2>
        <button 
          onClick={resetStrafes} 
          className="text-bright select-none shadow-md px-5 py-1 rounded-md bg-primary hover:scale-110 active:scale-95 transition-all"
        >
          Reset
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <StatsTable
          alls={allStats().alls}
          early={allStats().early}
          good={allStats().good}
          perfect={allStats().perfect}
          late={allStats().late}
          lmbFired={lmbFired()}
        />
      </div>
    </div>

    {/* Chart Panel - Shorter */}
    <div className="flex flex-col w-[50%] bg-secondary/30 dark:bg-secondary/20 rounded-xl p-4 shadow-xl 
                    h-fit max-h-[45vh]">   {/* ← This controls the height */}
      <h2 className="select-none text-2xl font-bold mb-3">Strafe Timing Chart</h2>
      <div className="flex-1 min-h-0 overflow-hidden">
        <MyChart
          earlyStrafes={allStrafes().filter(s => s.type === "Early").map(s => s.duration)}
          goodStrafes={allStrafes().filter(s => s.type === "Good").map(s => s.duration)}
          perfectStrafes={allStrafes().filter(s => s.type === "Perfect").map(s => s.duration)}
          lateStrafes={allStrafes().filter(s => s.type === "Late").map(s => s.duration)}
        />
      </div>
    </div>
  </div>

  {/* WASD Visualizer */}
  <div className="h-32 flex items-center justify-center flex-shrink-0">
    <WASD />
  </div>

  {/* History Bar */}
  <div className="flex flex-row p-3 bg-accent/25 dark:bg-accent/20 h-20 overflow-x-auto w-full gap-3 scrollbar-hide flex-shrink-0">
    <For each={recentStrafes()}>
      {(strafe) => (
        <div 
          key={/* add key if possible */}
          className="flex-shrink-0 shadow-md select-none flex flex-col border border-dark/30 dark:border-bright/30 border-t bg-secondary/45 dark:bg-secondary/40 rounded-md justify-center items-center min-w-[68px] px-2 py-1"
        >
          <p className="font-bold text-center text-sm" style={{ color: colorMap[strafe.type] }}>
            {strafe.type}
          </p>
          <p className="text-center text-sm">{draw_time(strafe.duration)}</p>
        </div>
      )}
    </For>
  </div>
</div>
  );
}

export default App;

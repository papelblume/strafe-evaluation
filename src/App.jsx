import { createSignal, onMount, createEffect, onCleanup, For } from "solid-js";
import "./App.css";
import { Chart, registerables } from 'chart.js'
import { Bar } from 'solid-chartjs'
import { listen } from '@tauri-apps/api/event'

function draw_time(time) {
  if (time < 0) {
    return "-" + (Math.abs(time) / 1000).toFixed(0) + " ms";
  }
  return (time / 1000).toFixed(0) + " ms";
}

function getMeanAndVar(arr) {
  if (arr.length === 0) return { average: 0, std_deviation: 0 };

  var sum = arr.reduce((pre, cur) => pre + cur);
  let num = arr.length;
  var average = sum / num;

  let variance = 0;
  arr.forEach(num => {
    variance += ((num - average) * (num - average));
  });
  variance /= num;
  variance = Math.sqrt(variance);

  return {
    average: average,
    std_deviation: variance
  }
}

function getStats(duration_array) {
  if (duration_array.length < 1) {
    return { median: 0, min: 0, max: 0, average: 0, std_deviation: 0, samples: 0 };
  }

  const absValues = duration_array.map(Math.abs);
  const sorted = [...absValues].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  let median;
  if (sorted.length % 2 === 0) {
    median = (sorted[middle - 1] + sorted[middle]) / 2;
  } else {
    median = sorted[middle];
  }

  let o = getMeanAndVar(absValues);

  return {
    median: median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    average: o.average,
    std_deviation: o.std_deviation,
    samples: duration_array.length
  };
}

function getOccurance(duration_array) {
  if (!duration_array || duration_array.length === 0) {
    return new Array(81).fill(0);
  }

  let out = new Array(81).fill(0);

  duration_array.forEach(x => {
    let n;
    if (x < 0) {
      n = Math.floor(Math.abs(x) / 5000);
      if (n < 40) out[40 - n] += 1;
    } else {
      n = Math.ceil(x / 5000);
      if (n < 40) out[40 + n] += 1;
    }
  });

  return out;
}

const MyChart = (props) => {
  const labels = Array.from({ length: 101 }, (_, i) => (i - 50) * 4);

  const [chartData, setChartData] = createSignal({
    labels: labels,
    datasets: [
      { label: 'Early', data: getOccurance([]), borderRadius: 5, backgroundColor: "#8cb5a8" },
      { label: 'Late', data: getOccurance([]), borderRadius: 5, backgroundColor: "#a5c5ae" },
      { label: 'Perfect', data: getOccurance([]), borderRadius: 5, backgroundColor: "#b5ac8c" },
    ],
  });

  onMount(() => {
    Chart.register(...registerables);
  });

  createEffect(() => {
    const { earlyStrafes, lateStrafes, perfectStrafes } = props;

    setChartData({
      labels: labels,
      datasets: [
        { label: 'Early', data: getOccurance(earlyStrafes), borderRadius: 5, backgroundColor: "#8cb5a8" },
        { label: 'Late', data: getOccurance(lateStrafes), borderRadius: 5, backgroundColor: "#a5c5ae" },
        { label: 'Perfect', data: getOccurance(perfectStrafes), borderRadius: 5, backgroundColor: "#b5ac8c" },
      ],
    });
  });

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    scales: {
      x: { 
        stacked: true,
        ticks: { color: 'var(--chart-text)', font: { size: 12 } },
        grid: { color: 'var(--chart-grid)' }
      },
      y: { 
        stacked: true,
        ticks: { color: 'var(--chart-text)', font: { size: 12 } },
        grid: { color: 'var(--chart-grid)' }
      }
    },
    plugins: {
      legend: {
        labels: { color: 'var(--chart-text)' }
      }
    }
  };

  return (
    <div>
      <Bar data={chartData()} options={chartOptions} width={4} height={3} />
    </div>
  );
};

function Stats(props) {
  const [stats, setStats] = createSignal({
    alls: getStats([]),
    early: getStats([]),
    late: getStats([]),
    perfect: getStats([])
  });

  const [perfectCount, setPerfectCount] = createSignal(0);

  createEffect(() => {
    const { earlyStrafes, lateStrafes, perfectStrafes } = props;

    setPerfectCount(perfectStrafes.length);

    setStats(() => ({
      alls: getStats([...earlyStrafes, ...lateStrafes, ...perfectStrafes]),
      early: getStats(earlyStrafes),
      late: getStats(lateStrafes),
      perfect: getStats(perfectStrafes)
    }));
  });

  return (
    <div className="flex flex-col justify-center items-center flex-grow">
      <table style="width:100%">
        <tbody className="text-center">
          <tr>
            <th></th>
            <th className="w-16">All</th>
            <th className="w-16">Early</th>
            <th className="w-16">Late</th>
            <th className="w-16">Perfect</th>
          </tr>
          <tr>
            <th>Median</th>
            <td>{draw_time(stats().alls.median)}</td>
            <td>{draw_time(stats().early.median)}</td>
            <td>{draw_time(stats().late.median)}</td>
            <td>{draw_time(stats().perfect.median)}</td>
          </tr>
          <tr>
            <th>Average</th>
            <td>{draw_time(stats().alls.average)}</td>
            <td>{draw_time(stats().early.average)}</td>
            <td>{draw_time(stats().late.average)}</td>
            <td>{draw_time(stats().perfect.average)}</td>
          </tr>
          <tr>
            <th>Min</th>
            <td>{draw_time(stats().alls.min)}</td>
            <td>{draw_time(stats().early.min)}</td>
            <td>{draw_time(stats().late.min)}</td>
            <td>{draw_time(stats().perfect.min)}</td>
          </tr>
          <tr>
            <th>Max</th>
            <td>{draw_time(stats().alls.max)}</td>
            <td>{draw_time(stats().early.max)}</td>
            <td>{draw_time(stats().late.max)}</td>
            <td>{draw_time(stats().perfect.max)}</td>
          </tr>
          <tr>
            <th>Std. Deviation</th>
            <td>{draw_time(stats().alls.std_deviation)}</td>
            <td>{draw_time(stats().early.std_deviation)}</td>
            <td>{draw_time(stats().late.std_deviation)}</td>
            <td>{draw_time(stats().perfect.std_deviation)}</td>
          </tr>
          <tr>
            <th>Samples</th>
            <td>{stats().alls.samples}</td>
            <td>{stats().early.samples}</td>
            <td>{stats().late.samples}</td>
            <td>{stats().perfect.samples}</td>
          </tr>
        </tbody>
      </table>
      <div className="italic font-bold text-xl pt-4">
        <h1>Perfect {perfectCount()}x</h1>
      </div>
    </div>
  );
}

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

  async function simulateEarly() {
    setAPressed(true);
    setTimeout(() => setDPressed(true), 500);
    setTimeout(() => setAPressed(false), 850);
    setTimeout(() => setDPressed(false), 1350);
  }

  async function simulateLate() {
    setAPressed(true);
    setTimeout(() => setAPressed(false), 500);
    setTimeout(() => setDPressed(true), 850);
    setTimeout(() => setDPressed(false), 1350);
  }

  async function simulatePerfect() {
    const delay = Math.floor(Math.random() * 81);
    setAPressed(true);
    setTimeout(() => setAPressed(false), 500);
    setTimeout(() => setDPressed(true), 500 + delay);
    setTimeout(() => setDPressed(false), 1000 + delay);
  }

  return (
    <div className="flex group justify-center items-center w-full h-full">
      <div className="flex flex-col basis-0 flex-grow items-end opacity-0 -translate-x-2 duration-200 group-hover:opacity-100 group-hover:translate-x-0">
        <button className="wasd-button text-white bg-secondary" onClick={simulateEarly}>Early</button>
        <button className="wasd-button text-white bg-accent" onClick={simulateLate}>Late</button>
        <button className="wasd-button text-white bg-[#b5ac8c]" onClick={simulatePerfect}>Perfect</button>
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
  const [totalStrafes, setTotalStrafes] = createSignal([]);
  const [earlyStrafes, setEarlyStrafes] = createSignal([]);
  const [lateStrafes, setLateStrafes] = createSignal([]);
  const [perfectStrafes, setPerfectStrafes] = createSignal([]);

  const [countOnlyLMB, setCountOnlyLMB] = createSignal(false);
  const [isDark, setIsDark] = createSignal(false);

  onMount(() => {
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

  const toggleTheme = () => setIsDark(prev => !prev);

  function resetStrafes() {
    setEarlyStrafes([]);
    setLateStrafes([]);
    setPerfectStrafes([]);
    setTotalStrafes([]);
  }

  // Strafe listener - respects the "Count only on LMB" toggle
  createEffect(() => {
    let unlistenStrafe;

    const setupListeners = async () => {
      unlistenStrafe = await listen('strafe', (event) => {
        const { strafe_type: type, duration, lmb_pressed } = event.payload;

        let finalDuration = duration;
        if (type === "Early") {
          finalDuration = -duration;
        }

        const strafe = { type, duration: finalDuration };

        // Only count Early/Late when LMB is pressed (or when the toggle is disabled)
        // Perfect strafes are always counted
        const shouldCount = !countOnlyLMB() || lmb_pressed || type === "Perfect";

        if (shouldCount) {
          switch (type) {
            case "Early":
              setEarlyStrafes(a => [finalDuration, ...a]);
              break;
            case "Late":
              setLateStrafes(a => [finalDuration, ...a]);
              break;
            case "Perfect":
              setPerfectStrafes(a => [finalDuration, ...a]);
              break;
          }

          setTotalStrafes(a => [strafe, ...a]);
        }
      });
    };

    onCleanup(() => {
      if (typeof unlistenStrafe === "function") unlistenStrafe();
    });

    setupListeners();
  });

  return (
    <div class="w-screen h-screen bg-bright dark:bg-dark text-dark dark:text-bright flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center px-8 select-none">
        <div className="flex justify-center items-center flex-1">
          <h1 className="mr-3 drop-shadow-lg py-4 text-4xl pointer-events-none font-bold text-center text-dark dark:text-bright text-stroke italic">
            PatrikZero's
          </h1>
          <h1 className="py-4 text-4xl font-bold text-center pointer-events-none">
            Strafe Evaluation
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Count only on LMB toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
            <input
              type="checkbox"
              checked={countOnlyLMB()}
              onChange={(e) => setCountOnlyLMB(e.target.checked)}
              className="w-5 h-5 accent-primary cursor-pointer"
            />
            <span className="font-medium">Count only on LMB</span>
          </label>

          <button
            onClick={toggleTheme}
            class="px-6 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-medium shadow-md flex items-center gap-2 transition-all active:scale-95"
          >
            {isDark() ? '☀️ Bright Mode' : '🌙 Dark Mode'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="justify-between flex-grow flex p-4 gap-4">
        <div className="flex flex-col rounded-xl border border-white/30 dark:border-white/10 m-0 p-4 w-[50%] bg-secondary/50 dark:bg-secondary/30 shadow-xl">
          <div className="flex justify-between mb-4">
            <h2 className="select-none text-2xl font-bold">Statistics</h2>
            <button
              className="text-bright select-none shadow-md px-5 py-1 rounded-md bg-primary hover:scale-110 active:scale-95 transition-all"
              onClick={resetStrafes}
            >
              Reset
            </button>
          </div>
          <Stats 
            earlyStrafes={earlyStrafes()} 
            lateStrafes={lateStrafes()} 
            perfectStrafes={perfectStrafes()} 
          />
        </div>

        <div className="flex flex-col w-[50%] bg-secondary/30 dark:bg-secondary/20 rounded-xl p-4 shadow-xl">
          <MyChart 
            earlyStrafes={earlyStrafes()} 
            lateStrafes={lateStrafes()} 
            perfectStrafes={perfectStrafes()} 
          />
        </div>
      </div>

      {/* WASD Area */}
      <div className="h-32 mb-4 flex items-center justify-center">
        <WASD />
      </div>

      {/* History Bar */}
      <div className="flex flex-row p-3 bg-accent/25 dark:bg-accent/20 h-20 overflow-x-auto w-full gap-3">
        <For each={totalStrafes()}>
          {(strafe) => (
            <div className="flex-shrink-0 shadow-md select-none flex flex-col border border-dark/30 dark:border-bright/30 border-t bg-secondary/45 dark:bg-secondary/40 rounded-md justify-center items-center min-w-[68px] px-2 py-1">
              <p className="font-bold text-center text-sm">{strafe.type}</p>
              <p className="text-center text-sm">{draw_time(strafe.duration)}</p>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

export default App;

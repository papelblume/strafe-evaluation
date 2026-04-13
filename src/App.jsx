import { createSignal, onMount, createEffect, onCleanup, For } from "solid-js";
import "./App.css";
import { Chart, registerables } from 'chart.js'
import { Bar } from 'solid-chartjs'
import { listen } from '@tauri-apps/api/event'

const COLORS = {
  dark: {
    bg:         "#181a18",
    panel:      "#1f2d1e",
    accent:     "#1a3028",
    primary:    "#4a7040",
    text:       "#d0dccb",
    textStroke: "#d0dccb",
    chartEarly:   "#4a7040",
    chartLate:    "#3a7068",
    chartPerfect: "#6b6040",
    perfect:    "#6b6040",
  },
  light: {
    bg:         "#f4f4f4",
    panel:      "#a5c5ae",
    accent:     "#8cb5a8",
    primary:    "#88a56f",
    text:       "#3a3f36",
    textStroke: "#3a3f36",
    chartEarly:   "#a5c5ae",
    chartLate:    "#8cb5a8",
    chartPerfect: "#b5ac8c",
    perfect:    "#b5ac8c",
  },
}

function draw_time(time) {
  return (time / 1000).toFixed(0) + " ms"
}

function getMeanAndVar(arr) {
  var sum = arr.reduce(function (pre, cur) { return pre + cur; })
  let num = arr.length
  var average = sum / num;
  let variance = 0;
  arr.forEach(num => { variance += ((num - average) * (num - average)); });
  variance /= num;
  variance = Math.sqrt(variance)
  return { average: average, std_deviation: variance }
}

function getStats(duration_array) {
  if (duration_array.length < 1) {
    return { median: 0, min: 0, max: 0, average: 0, std_deviation: 0, samples: 0 }
  }
  const sorted = Array.from(duration_array).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  let median;
  if (sorted.length % 2 === 0) {
    median = (sorted[middle - 1] + sorted[middle]) / 2;
  } else median = sorted[middle]
  let o = getMeanAndVar(duration_array)
  return { median, min: sorted[0], max: sorted[sorted.length - 1], average: o.average, std_deviation: o.std_deviation, samples: duration_array.length }
}

function getOccurance(duration_array) {
  if (!duration_array || duration_array.length == 0) return [0]
  let out = new Array(41).fill(0);
  duration_array.map((x) => {
    let n = Math.ceil(x / 5000)
    out[n] = out[n] + 1
  })
  return out
}

const MyChart = (props) => {
  const labels = Array.from({ length: 201 / 5 + 1 }, (_, i) => i * 5);

  const getChartData = (earlyStrafes, lateStrafes, perfectStrafes, c) => ({
    labels,
    datasets: [
      { label: 'Early',   data: getOccurance(earlyStrafes),  borderRadius: 5, backgroundColor: c.chartEarly },
      { label: 'Late',    data: getOccurance(lateStrafes),   borderRadius: 5, backgroundColor: c.chartLate },
      { label: 'Perfect', data: [perfectStrafes.length],     borderRadius: 5, backgroundColor: c.chartPerfect },
    ],
  })

  const getChartOptions = (c) => ({
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { labels: { color: c.text } }
    },
    scales: {
      x: { stacked: true, ticks: { color: c.text }, grid: { color: c.text + "20" } },
      y: { stacked: true, ticks: { color: c.text }, grid: { color: c.text + "20" } },
    }
  })

  const c = () => props.isDark ? COLORS.dark : COLORS.light;
  const [chartData,    setChartData]    = createSignal(getChartData([], [], [], COLORS.dark))
  const [chartOptions, setChartOptions] = createSignal(getChartOptions(COLORS.dark))

  onMount(() => { Chart.register(...registerables) })

  createEffect(() => {
    const { earlyStrafes, lateStrafes, perfectStrafes } = props;
    setChartData(getChartData(earlyStrafes, lateStrafes, perfectStrafes, c()))
    setChartOptions(getChartOptions(c()))
  })

  return (
    <div>
      <Bar data={chartData()} options={chartOptions()} width={4} height={3} />
    </div>
  )
}

function Stats(props) {
  const [stats, setStats] = createSignal(
    { alls: getStats([]), early: getStats([]), late: getStats([]), perfect: getStats([]) },
    { equals: false }
  );
  const [perfectCount, setPerfectCount] = createSignal(0)

  createEffect(() => {
    const { earlyStrafes, lateStrafes, perfectStrafes } = props;
    setPerfectCount(perfectStrafes.length)
    setStats((prev) => {
      prev.alls    = getStats([...earlyStrafes, ...lateStrafes, ...perfectStrafes])
      prev.early   = getStats(earlyStrafes)
      prev.late    = getStats(lateStrafes)
      prev.perfect = getStats(perfectStrafes)
      return prev
    })
  })

  return (
    <div class="flex flex-col justify-center items-center flex-grow">
      <table style="width:100%">
        <tbody class="text-center">
          <tr>
            <th></th>
            <th class="w-16">All</th>
            <th class="w-16">Early</th>
            <th class="w-16">Late</th>
            <th class="w-16">Perfect</th>
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
      <div class="italic font-bold text-xl pt-4">
        <h1>Perfect {perfectCount() + "x"}</h1>
      </div>
    </div>
  )
}

function WASD(props) {
  const [aPressed, setAPressed] = createSignal(false);
  const [dPressed, setDPressed] = createSignal(false);
  const c = () => props.isDark ? COLORS.dark : COLORS.light;

  createEffect(() => {
    let unlistenA, unlistenReleaseA, unlistenReleaseD, unlistenD
    const setupListeners = async () => {
      unlistenA        = await listen('a-pressed',  () => setAPressed(true));
      unlistenD        = await listen('d-pressed',  () => setDPressed(true));
      unlistenReleaseA = await listen('a-released', () => setAPressed(false));
      unlistenReleaseD = await listen('d-released', () => setDPressed(false));
    };
    onCleanup(() => {
      if (typeof unlistenA === "function") {
        unlistenA(); unlistenReleaseA(); unlistenReleaseD(); unlistenD();
      }
    });
    setupListeners();
  });

  async function simulateEarly() {
    setAPressed(true)
    setTimeout(() => setAPressed(false), 500);
    setTimeout(() => setDPressed(true),  850);
    setTimeout(() => setDPressed(false), 1350);
  }
  async function simulateLate() {
    setAPressed(true)
    setTimeout(() => setDPressed(true),  500);
    setTimeout(() => setAPressed(false), 850);
    setTimeout(() => setDPressed(false), 1350);
  }
  async function simulatePerfect() {
    setAPressed(true)
    setTimeout(() => setDPressed(true),  500);
    setTimeout(() => setAPressed(false), 500);
    setTimeout(() => setDPressed(false), 1000);
  }

  const keyStyle = (pressed) => () => ({
    "background-color": pressed() ? c().accent + "80" : "rgba(180,180,180,0.15)",
    "border-color":     c().text + "20",
    "color":            c().text,
    "transform":        pressed() ? "translateY(4px)" : "none",
  });

  return (
    <div class="flex group justify-center items-center w-full h-full">
      <div class="flex flex-col basis-0 flex-grow items-end opacity-0 -translate-x-2 duration-200 group-hover:opacity-100 group-hover:translate-x-0">
        <button class="wasd-button text-white" style={{ "background-color": c().panel }}    onClick={simulateEarly}>Early</button>
        <button class="wasd-button text-white" style={{ "background-color": c().accent }}   onClick={simulateLate}>Late</button>
        <button class="wasd-button text-white" style={{ "background-color": c().perfect }}  onClick={simulatePerfect}>Perfect</button>
      </div>

      <div class="flex justify-center basis-0 flex-grow">
        <div class="select-none pointer-events-none flex justify-between w-40 text-center font-bold text-xl">
          <div class="flex border border-r border-b shadow-lg w-16 h-16 rounded-md justify-center items-center duration-75"
               style={keyStyle(aPressed)()}>
            <p>A</p>
          </div>
          <div class="flex border border-l border-b shadow-lg w-16 h-16 rounded-md justify-center items-center duration-75"
               style={keyStyle(dPressed)()}>
            <p>D</p>
          </div>
        </div>
      </div>
      <div class="basis-0 flex-grow min-w-[200px]"></div>
    </div>
  )
}

function App() {
  const [isDark, setIsDark] = createSignal(true);
  const [totalStrafes,   setTotalStrafes]   = createSignal([]);
  const [earlyStrafes,   setEarlyStrafes]   = createSignal([]);
  const [lateStrafes,    setLateStrafes]    = createSignal([]);
  const [perfectStrafes, setPerfectStrafes] = createSignal([]);

  const c = () => isDark() ? COLORS.dark : COLORS.light;

  function resetStrafes() {
    setEarlyStrafes([]); setLateStrafes([]); setPerfectStrafes([]); setTotalStrafes([]);
  }

  createEffect(() => {
    let unlistenStrafe
    const setupListeners = async () => {
      unlistenStrafe = await listen('strafe', (event) => {
        let strafe = { type: event.payload.strafe_type, duration: event.payload.duration }
        switch (strafe.type) {
          case "Early":   setEarlyStrafes(a   => [strafe.duration, ...a]); break;
          case "Late":    setLateStrafes(a    => [strafe.duration, ...a]); break;
          case "Perfect": setPerfectStrafes(a => [strafe.duration, ...a]); break;
        }
        setTotalStrafes(a => [strafe, ...a])
      })
    };
    onCleanup(() => { if (typeof unlistenStrafe === "function") unlistenStrafe(); });
    setupListeners();
  });

  return (
    <div class="w-screen h-screen flex flex-col" style={{ "background-color": c().bg, "color": c().text }}>

      {/* Header */}
      <div class="relative flex justify-center items-center select-none pointer-events-none">
        <h1 class="mr-3 drop-shadow-lg py-4 text-4xl pointer-events-none font-bold text-center italic"
            style={{ "color": c().bg, "-webkit-text-stroke": "1px " + c().textStroke }}>PatrikZero's</h1>
        <h1 class="py-4 text-4xl font-bold text-center pointer-events-none">Strafe Evaluation</h1>
        <button
          class="absolute right-4 pointer-events-auto shadow-md px-3 py-1 rounded-md hover:scale-105"
          style={{ "background-color": c().primary, "color": c().bg }}
          onClick={() => setIsDark(d => !d)}
        >
          {isDark() ? "☀ Light" : "☾ Dark"}
        </button>
      </div>

      {/* Main panels */}
      <div class="justify-between flex-grow flex">
        <div class="flex flex-col rounded-xl border-t border-white/10 m-4 p-4 w-[50%] shadow-xl"
             style={{ "background-color": c().panel + "80" }}>
          <div class="flex justify-between mb-2">
            <h2 class="select-none text-2xl font-bold">Statistics</h2>
            <button class="select-none shadow-md px-2 rounded-md hover:scale-110"
                    style={{ "background-color": c().primary, "color": c().bg }}
                    onClick={resetStrafes}>Reset</button>
          </div>
          <Stats earlyStrafes={earlyStrafes()} lateStrafes={lateStrafes()} perfectStrafes={perfectStrafes()} />
        </div>
        <div class="flex flex-col m-4 justify-center rounded-xl w-[50%]">
          <MyChart earlyStrafes={earlyStrafes()} lateStrafes={lateStrafes()} perfectStrafes={perfectStrafes()} isDark={isDark()} />
        </div>
      </div>

      {/* WASD */}
      <div class="h-32 mb-4 flex items-center justify-center">
        <WASD isDark={isDark()} />
      </div>

      {/* Strafe history bar */}
      <div class="flex flex-row p-2 h-20 overflow-clip w-full"
           style={{ "background-color": c().accent + "40" }}>
        <For each={totalStrafes()}>{(strafe) =>
          <div class="flex shadow-md select-none flex-col rounded-md justify-center items-center min-w-16 mr-2"
               style={{ "background-color": c().panel + "70", "border-top": "1px solid " + c().bg + "bf" }}>
            <p class="font-bold text-center">{strafe.type}</p>
            <p class="text-center">{draw_time(strafe.duration)}</p>
          </div>
        }</For>
      </div>

    </div>
  );
}

export default App;

import { createSignal, onMount, createEffect, onCleanup, For } from "solid-js";
import "./App.css";
import { Chart, registerables } from 'chart.js'
import { Bar } from 'solid-chartjs'
import { listen } from '@tauri-apps/api/event'

function draw_time(time) {
  return (time / 1000).toFixed(0) + " ms"
}

// ... (getMeanAndVar, getStats, getOccurance, MyChart, Stats stay exactly the same)

function WASD() {
  const [aPressed, setAPressed] = createSignal(false);
  const [dPressed, setDPressed] = createSignal(false);

  // ... (listeners and simulate functions stay the same)

  return (
    <div className="flex group justify-center items-center w-full h-full">

      <div className="flex flex-col basis-0 flex-grow items-end opacity-0 -translate-x-2 duration-200 group-hover:opacity-100 group-hover:translate-x-0">
        <button className="wasd-button text-white bg-secondary" onClick={simulateEarly}>Early</button>
        <button className="wasd-button text-white bg-accent" onClick={simulateLate}>Late</button>
        <button className="wasd-button text-white bg-[#b5ac8c]" onClick={simulatePerfect}>Perfect</button>
      </div>

      <div className="flex justify-center basis-0 flex-grow">
        <div className="select-none pointer-events-none text-dark dark:text-bright flex justify-between w-40 text-center font-bold text-xl">
          <div className={`flex border border-dark/20 dark:border-bright/20 border-r border-b shadow-lg border-b-dark/50 dark:border-b-bright/50 w-16 h-16 rounded-md justify-center items-center duration-75 ${aPressed() ? "bg-accent/70 scale-100 translate-y-[4px]" : "bg-secondary/10 dark:bg-secondary/20"}`}>
            <p>A</p>
          </div>
          <div className={`flex border border-dark/20 dark:border-bright/20 border-l border-b shadow-lg border-b-dark/50 dark:border-b-bright/50 w-16 h-16 rounded-md justify-center items-center duration-75 ${dPressed() ? "bg-accent/70 translate-y-[4px]" : "bg-secondary/10 dark:bg-secondary/20"}`}>
            <p>D</p>
          </div>
        </div>
      </div>

      <div className="basis-0 flex-grow min-w-[200px]"></div>
    </div>
  )
}

function App() {
  // ==================== THEME TOGGLE ====================
  const [isDark, setIsDark] = createSignal(false);

  // Load saved theme (or system preference) on mount
  onMount(() => {
    const saved = localStorage.getItem('theme');
    if (saved) {
      setIsDark(saved === 'dark');
    } else {
      // Optional: respect the user's OS dark mode
      setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
  });

  // Apply Tailwind's 'dark' class whenever the signal changes
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
  // =====================================================

  // ... (all your existing signals and listeners stay exactly the same)

  return (
    <div class="w-screen h-screen bg-bright dark:bg-dark text-dark dark:text-bright flex flex-col">
      {/* 1 - Header with toggle button */}
      <div className="flex justify-between items-center px-8 select-none">
        <div className="flex justify-center items-center flex-1">
          <h1 className="mr-3 drop-shadow-lg py-4 text-4xl pointer-events-none font-bold text-center text-dark dark:text-bright text-stroke italic">PatrikZero's</h1>
          <h1 className="py-4 text-4xl font-bold text-center pointer-events-none">Strafe Evaluation</h1>
        </div>

        {/* Theme toggle button */}
        <button
          onClick={toggleTheme}
          class="px-6 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-medium shadow-md flex items-center gap-2 transition-colors"
        >
          {isDark() ? '☀️ Bright' : '🌙 Dark'}
        </button>
      </div>

      {/* 2 - Main content area */}
      <div className="justify-between flex-grow flex">
        {/* A - Statistics panel */}
        <div className="flex flex-col rounded-xl border-t border-white m-4 p-4 w-[50%] bg-secondary/50 dark:bg-secondary/30 shadow-xl">
          <div className="flex justify-between mb-2">
            <h2 className="select-none text-2xl font-bold">Statistics</h2>
            <button className="text-bright select-none shadow-md px-2 rounded-md bg-primary hover:scale-110" onClick={() => resetStrafes()}>Reset</button>
          </div>
          <Stats earlyStrafes={earlyStrafes()} lateStrafes={lateStrafes()} perfectStrafes={perfectStrafes()} />
        </div>

        {/* B - Chart */}
        <div className="flex flex-col m-4 justify-center rounded-xl w-[50%]">
          <MyChart earlyStrafes={earlyStrafes()} lateStrafes={lateStrafes()} perfectStrafes={perfectStrafes()} />
        </div>
      </div>

      {/* 3 - WASD */}
      <div className="h-32 mb-4 flex items-center justify-center">
        <WASD />
      </div>

      {/* 4 - History bar */}
      <div className="flex flex-row p-2 bg-accent/25 dark:bg-accent/20 h-20 overflow-clip w-full">
        <For each={totalStrafes()}>
          {(strafe, i) => (
            <div className="flex shadow-md select-none flex-col border border-dark/30 dark:border-bright/30 border-t bg-secondary/45 dark:bg-secondary/30 rounded-md justify-center items-center min-w-16 mr-2">
              <p className="font-bold text-center">{strafe.type}</p>
              <p className="text-center">{draw_time(strafe.duration)}</p>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

export default App;

/** Fixed simulation step; elapsed wall time is independent of display refresh rate.
 * A long stall advances at most 250 ms. Hidden/paused time is deliberately discarded. */
export function makeClock(speed = 1) {
  let last: number | null = null;
  let debt = 0;
  let wasStopped = true;
  return {
    droppedMs: 0,
    reset() { last = null; debt = 0; wasStopped = true; },
    advance(now: number, stopped: boolean, step: () => void): number {
      const elapsed = last === null ? 0 : Math.max(0, now - last);
      last = now;
      if (stopped || wasStopped) {
        wasStopped = stopped;
        debt = 0;
        return 0;
      }
      this.droppedMs += Math.max(0, elapsed - 250 / speed);
      debt += Math.min(elapsed * speed, 250);
      let steps = 0;
      while (debt + 1e-7 >= 1000 / 60 && steps < 15) {
        step();
        debt -= 1000 / 60;
        steps++;
      }
      return steps;
    },
  };
}

export interface ClockProbe {offsetMs: number; rttMs: number}
export const probeClock = async (requestServerTime: () => Promise<number>, samples = 5, now: () => number = Date.now): Promise<ClockProbe> => {
  const probes: ClockProbe[] = [];
  for (let index = 0; index < samples; index += 1) {
    const start = now(); const serverTime = await requestServerTime(); const end = now(); const rttMs = end - start;
    probes.push({offsetMs: serverTime - (start + rttMs / 2), rttMs});
  }
  return probes.sort((left, right) => left.rttMs - right.rttMs)[0]!;
};

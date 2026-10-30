/* Измеритель громкости микрофона. Тот же путь (AudioWorklet), каким приложение будет брать сырые отсчёты для проверки тонов. */
class Lvl extends AudioWorkletProcessor {
  constructor() { super(); this.sum = 0; this.peak = 0; this.cnt = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        const x = ch[i];
        this.sum += x * x;
        const a = x < 0 ? -x : x;
        if (a > this.peak) this.peak = a;
      }
      this.cnt += ch.length;
      if (this.cnt >= 2400) { // примерно каждые 50 мс
        this.port.postMessage({ rms: Math.sqrt(this.sum / this.cnt), peak: this.peak, n: this.cnt });
        this.sum = 0; this.peak = 0; this.cnt = 0;
      }
    }
    return true;
  }
}
registerProcessor("lvl", Lvl);

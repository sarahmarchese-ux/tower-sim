// Game time as a single number: minutes elapsed since the game began, at
// 6:00 AM on a Monday (day 0). Everything else — the hour, the day of the
// week, whether it's a weekend — is just arithmetic on that one number,
// which is what keeps "what time is it" impossible to get out of sync with
// itself.

const MINUTES_PER_DAY = 24 * 60;
const GAME_MINUTES_PER_REAL_SECOND = 5; // the design doc's 1x baseline

const Clock = {
  totalMinutes: 6 * 60,
  speed: 1, // 0 = paused, 1 = normal, 3 = fast
  _speedBeforePause: 1,

  update(deltaMs) {
    if (this.speed === 0) return;
    this.totalMinutes += (deltaMs / 1000) * GAME_MINUTES_PER_REAL_SECOND * this.speed;
  },

  get day() {
    return Math.floor(this.totalMinutes / MINUTES_PER_DAY);
  },
  get minuteOfDay() {
    return this.totalMinutes % MINUTES_PER_DAY;
  },
  // Fractional hour (13.5 = 1:30 PM) — the sky gradient interpolates on this.
  get hour() {
    return this.minuteOfDay / 60;
  },
  get isWeekend() {
    return this.day % 7 >= 5; // days 5 and 6 of every 7 (we start on a Monday)
  },

  togglePause() {
    if (this.speed === 0) {
      this.speed = this._speedBeforePause;
    } else {
      this._speedBeforePause = this.speed;
      this.speed = 0;
    }
  },

  setSpeed(speed) {
    this.speed = speed;
  },

  // A clock face for the top bar: "Mon 9:00 AM".
  label() {
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const minute = Math.floor(this.minuteOfDay);
    const hour24 = Math.floor(minute / 60);
    const minuteOfHour = minute % 60;
    const ampm = hour24 < 12 ? "AM" : "PM";
    const hour12 = hour24 % 12 || 12;
    return `${dayNames[this.day % 7]} ${hour12}:${String(minuteOfHour).padStart(2, "0")} ${ampm}`;
  },
};

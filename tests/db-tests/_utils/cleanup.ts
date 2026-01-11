export class CleanupTracker {
  private tasks: Array<() => Promise<void> | void> = [];

  add(task: () => Promise<void> | void): void {
    this.tasks.push(task);
  }

  async run(): Promise<void> {
    const pending = this.tasks.splice(0).reverse();
    for (const task of pending) {
      try {
        await task();
      } catch (error) {
        console.warn("[cleanup] task failed", error);
      }
    }
  }
}

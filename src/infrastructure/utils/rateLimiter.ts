export class RateLimiter {
    private lastRequest: number = 0;
    private queue: Array<() => void> = [];
    private processing: boolean = false;
    private readonly interval: number = 2000;
  
    async acquire(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.queue.push(resolve);
            this.processQueue();
        });
    }

    private async processQueue() {
        if (this.processing) {
            return;
        }
        this.processing = true;

        while (this.queue.length > 0) {
            const now = Date.now();
            const timeSinceLastRequest = now - this.lastRequest;
            
            if (timeSinceLastRequest < this.interval) {
                await new Promise(resolve => setTimeout(resolve, this.interval - timeSinceLastRequest));
            }

            const next = this.queue.shift();
            if (next) {
                this.lastRequest = Date.now();
                next();
            }
        }

        this.processing = false;
    }
}

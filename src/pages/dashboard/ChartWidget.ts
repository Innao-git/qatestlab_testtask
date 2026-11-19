import { type Locator, type Page, expect } from '@playwright/test';

/**
 * A dashboard pie-chart widget. The chart itself is a <canvas> (no values in the DOM), but its legend
 * and its hover tooltip are HTML - that is what the user reads, and what the tests read.
 */
export class ChartWidget {
  readonly canvas: Locator;
  readonly legendItems: Locator;
  readonly tooltip: Locator;

  constructor(
    private readonly page: Page,
    readonly root: Locator,
  ) {
    this.canvas = root.locator('canvas');
    this.legendItems = root.locator('.oxd-chart-legend li');
    this.tooltip = page.locator('.oxd-pie-chart-tooltip');
  }

  /** Legend labels in display order. */
  async legendLabels(): Promise<string[]> {
    await expect(this.legendItems.first()).toBeVisible();
    return (await this.legendItems.allInnerTexts()).map((t) => t.trim());
  }

  legendLabel(label: string): Locator {
    return this.legendItems.locator(`span[title="${label}"]`);
  }

  /** The chart is visible and actually painted (a blank canvas has no opaque pixels). */
  async expectRendered() {
    await expect(this.canvas).toBeVisible();
    await expect
      .poll(() => this.canvas.evaluate((c: HTMLCanvasElement) => {
        const pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let painted = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted++;
        return painted;
      }), { message: 'chart canvas must not be blank' })
      .toBeGreaterThan(0);
  }

  /**
   * Waits until the chart stops changing. The pie animates in on load (slices are drawn one after another);
   * hovering during the animation can miss slices that are not drawn yet - more likely on a loaded machine.
   * The canvas is "settled" when two snapshots taken 250 ms apart are identical.
   */
  async waitUntilSettled() {
    let previous = '';
    await expect
      .poll(async () => {
        const current = await this.canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
        const settled = current === previous;
        previous = current;
        return settled;
      }, { message: 'chart animation must finish', intervals: [250] })
      .toBe(true);
  }

  /**
   * Hovers a full circle over the ring of the pie and collects every tooltip shown, normalised to one line
   * ("Unassigned 175 (96.15%)"). Sweeping avoids depending on the chart's start angle or hole size; tiny
   * slices may be skipped, so callers assert on what was seen.
   */
  async collectTooltips(stepDegrees = 10): Promise<string[]> {
    await this.expectRendered();
    await this.waitUntilSettled();
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('chart canvas has no bounding box');
    const radius = Math.min(box.width, box.height) * 0.35;
    const seen = new Set<string>();
    for (let deg = 0; deg < 360; deg += stepDegrees) {
      const rad = (deg * Math.PI) / 180;
      await this.canvas.hover({ position: { x: box.width / 2 + radius * Math.sin(rad), y: box.height / 2 - radius * Math.cos(rad) } });
      // read visibility and text in ONE browser call: the tooltip can vanish between two separate calls,
      // and a waiting `innerText()` would then hang until the test times out
      const texts = await this.tooltip.evaluateAll((els) =>
        els.filter((e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true })).map((e) => (e as HTMLElement).innerText),
      );
      for (const text of texts) seen.add(text.replace(/\s+/g, ' ').trim());
    }
    return [...seen];
  }
}

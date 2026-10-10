import { describe, expect, it, vi } from 'vitest';
import { ViewportHostLifecycleAdapter } from './viewport-host-lifecycle';

describe('ViewportHostLifecycleAdapter', () => {
  it('mounts listeners and cleans them up idempotently', () => {
    class FakeTarget {
      readonly listeners = new Map<string, Set<(event: Event) => void>>();
      child?: FakeTarget;
      addEventListener(type: string, listener: (event: Event) => void): void {
        const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
        listeners.add(listener);
        this.listeners.set(type, listeners);
      }
      removeEventListener(type: string, listener: (event: Event) => void): void {
        this.listeners.get(type)?.delete(listener);
      }
      dispatch(type: string, event: Event): void {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
      }
      appendChild(child: FakeTarget): void {
        this.child = child;
      }
      contains(child: FakeTarget): boolean {
        return this.child === child;
      }
    }
    const container = new FakeTarget();
    const canvas = new FakeTarget();
    const handlers = {
      onResize: vi.fn(),
      onPointerDownCapture: vi.fn(),
      onPointerUpCapture: vi.fn(),
      onWheelCapture: vi.fn(),
      onWindowBlur: vi.fn(),
      onVisibilityChange: vi.fn(),
    };
    const adapter = new ViewportHostLifecycleAdapter(handlers);
    adapter.mount(container as unknown as HTMLElement, canvas as unknown as HTMLCanvasElement);
    expect(adapter.isMounted).toBe(true);
    expect(container.contains(canvas)).toBe(true);
    canvas.dispatch('pointerdown', {} as Event);
    expect(handlers.onPointerDownCapture).toHaveBeenCalledTimes(1);
    adapter.dispose();
    adapter.dispose();
    canvas.dispatch('pointerdown', {} as Event);
    expect(handlers.onPointerDownCapture).toHaveBeenCalledTimes(1);
    expect(adapter.isMounted).toBe(false);
  });
});

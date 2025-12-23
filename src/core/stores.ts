/**
 * Reactive Store System
 *
 * Provides a minimal observable store pattern for centralized state management.
 * Components subscribe to stores and automatically receive updates when state changes.
 *
 * This eliminates manual state synchronization between components.
 */
import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { CanvasConfig, Modifiers } from "./types";
import { type ToolId, type AllToolSettings, buildDefaultSettings } from "./tools";

type Listener<T> = (value: T) => void;

/**
 * Generic reactive store with subscribe/publish pattern
 */
export class Store<T> {
  private value: T;
  private listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.value = initial;
  }

  /**
   * Get current value
   */
  get(): T {
    return this.value;
  }

  /**
   * Set new value and notify all subscribers
   */
  set(value: T) {
    this.value = value;
    this.listeners.forEach((fn) => fn(value));
  }

  /**
   * Update value using a function (for immutable updates)
   */
  update(fn: (current: T) => T) {
    this.set(fn(this.value));
  }

  /**
   * Subscribe to value changes
   * @returns Unsubscribe function
   */
  subscribe(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Subscribe and immediately call with current value
   * @returns Unsubscribe function
   */
  subscribeImmediate(fn: Listener<T>): () => void {
    fn(this.value);
    return this.subscribe(fn);
  }
}

// ============================================================
// StoreController for Lit Components
// ============================================================

/**
 * Reactive controller that auto-subscribes Lit components to stores.
 * Handles lifecycle (connect/disconnect) and triggers re-renders on updates.
 *
 * Usage:
 *   private tool = new StoreController(this, toolStore);
 *   // Access via this.tool.value in render()
 *   // Set via this.tool.set(newValue)
 */
export class StoreController<T> implements ReactiveController {
  private host: ReactiveControllerHost;
  private store: Store<T>;
  private unsubscribe?: () => void;

  value: T;

  constructor(host: ReactiveControllerHost, store: Store<T>) {
    this.host = host;
    this.store = store;
    this.value = store.get();
    host.addController(this);
  }

  hostConnected() {
    this.unsubscribe = this.store.subscribe((value) => {
      this.value = value;
      this.host.requestUpdate();
    });
  }

  hostDisconnected() {
    this.unsubscribe?.();
  }

  get(): T {
    return this.value;
  }

  set(value: T) {
    this.store.set(value);
  }

  update(fn: (current: T) => T) {
    this.store.update(fn);
  }
}

// ============================================================
// App-Wide Singleton Stores
// ============================================================

/**
 * Current brush/drawing color (hex string)
 */
export const colorStore = new Store<string>("#037ffc");

/**
 * Previous color (before last committed change)
 * Updated when user finishes a color pick (mouseup/touchend)
 */
export const prevColorStore = new Store<string>("#000000");

/**
 * Current active tool
 */
export const toolStore = new Store<ToolId>("brush");

/**
 * Canvas configuration (dimensions)
 * Initialized with placeholder values - App.ts sets real values on init
 */
export const configStore = new Store<CanvasConfig>({
  pixelWidth: 0,
  pixelHeight: 0,
  viewportWidth: 0,
  viewportHeight: 0,
});

/**
 * Keyboard modifier keys state
 */
export const modifiersStore = new Store<Modifiers>({
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
});

/**
 * Per-tool settings - defaults derived from tool registry
 */
export const toolSettingsStore = new Store<AllToolSettings>(
  buildDefaultSettings() as AllToolSettings
);

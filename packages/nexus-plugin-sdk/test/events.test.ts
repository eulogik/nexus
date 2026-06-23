import { describe, it, expect } from 'vitest';
import { EventEmitter, PREDEFINED_EVENTS } from '../src/events.js';

describe('EventEmitter', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  it('on() registers event handler', () => {
    const handler = () => {};
    emitter.on('test', handler);
    expect(emitter.listenerCount('test')).toBe(1);
  });

  it('emit() calls registered handlers with args', () => {
    const calls: unknown[][] = [];
    emitter.on('data', (...args) => calls.push(args));
    emitter.emit('data', 'hello', 42);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['hello', 42]);
  });

  it('off() removes specific handler', () => {
    const calls: number[] = [];
    const fn = () => calls.push(1);
    emitter.on('evt', fn);
    emitter.emit('evt');
    expect(calls).toHaveLength(1);

    emitter.off('evt', fn);
    emitter.emit('evt');
    expect(calls).toHaveLength(1);
  });

  it('once() fires only once', () => {
    const calls: number[] = [];
    emitter.once('single', () => calls.push(1));
    emitter.emit('single');
    emitter.emit('single');
    expect(calls).toHaveLength(1);
  });

  it('removeAllListeners() clears all handlers', () => {
    emitter.on('a', () => {});
    emitter.on('b', () => {});
    emitter.once('c', () => {});
    emitter.removeAllListeners();
    expect(emitter.listenerCount('a')).toBe(0);
    expect(emitter.listenerCount('b')).toBe(0);
    expect(emitter.listenerCount('c')).toBe(0);
  });

  it('removeAllListeners(event) clears only that event', () => {
    emitter.on('x', () => {});
    emitter.on('y', () => {});
    emitter.removeAllListeners('x');
    expect(emitter.listenerCount('x')).toBe(0);
    expect(emitter.listenerCount('y')).toBe(1);
  });

  it('listenerCount() returns correct count', () => {
    expect(emitter.listenerCount('none')).toBe(0);
    emitter.on('evt', () => {});
    emitter.on('evt', () => {});
    emitter.once('evt', () => {});
    expect(emitter.listenerCount('evt')).toBe(3);
  });

  it('off() also removes once listeners', () => {
    const fn = () => {};
    emitter.once('evt', fn);
    emitter.off('evt', fn);
    expect(emitter.listenerCount('evt')).toBe(0);
  });
});

describe('PREDEFINED_EVENTS', () => {
  it('contains expected events', () => {
    expect(PREDEFINED_EVENTS).toContain('session:start');
    expect(PREDEFINED_EVENTS).toContain('session:end');
    expect(PREDEFINED_EVENTS).toContain('message:received');
    expect(PREDEFINED_EVENTS).toContain('tool:before');
    expect(PREDEFINED_EVENTS).toContain('tool:after');
    expect(PREDEFINED_EVENTS).toContain('error');
    expect(PREDEFINED_EVENTS).toHaveLength(6);
  });
});

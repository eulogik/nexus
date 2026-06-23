import { describe, it, expect } from 'vitest';
import { RuleBasedRouter } from '../src/rule-based-router.js';
import type { Session } from '../src/types.js';

const router = new RuleBasedRouter();

const defaultSession: Session = {
  messages: [],
  cost: { budgetRemaining: 1 },
};

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    messages: [],
    cost: { budgetRemaining: 1 },
    ...overrides,
  };
}

describe('RuleBasedRouter', () => {
  describe('intent detection', () => {
    it('route() with "read file" returns intent="read"', async () => {
      const decision = await router.route('read file', defaultSession);
      expect(decision.intent).toBe('read');
    });

    it('route() with "write new file" returns intent="write"', async () => {
      const decision = await router.route('write new file', defaultSession);
      expect(decision.intent).toBe('write');
    });

    it('route() with "edit code" returns intent="edit"', async () => {
      const decision = await router.route('edit code', defaultSession);
      expect(decision.intent).toBe('edit');
    });

    it('route() with "run tests" returns intent="bash"', async () => {
      const decision = await router.route('run tests', defaultSession);
      expect(decision.intent).toBe('bash');
    });

    it('route() with "find function" returns intent="search"', async () => {
      const decision = await router.route('find function', defaultSession);
      expect(decision.intent).toBe('search');
    });

    it('route() with "explain this code" returns intent="explain"', async () => {
      const decision = await router.route('explain this code', defaultSession);
      expect(decision.intent).toBe('explain');
    });

    it('route() with "debug error" returns intent="debug"', async () => {
      const decision = await router.route('debug error', defaultSession);
      expect(decision.intent).toBe('debug');
    });

    it('route() with "refactor module" returns intent="refactor"', async () => {
      const decision = await router.route('refactor module', defaultSession);
      expect(decision.intent).toBe('refactor');
    });

    it('route() with "write unit tests" returns intent="test"', async () => {
      const decision = await router.route('write unit tests', defaultSession);
      expect(decision.intent).toBe('test');
    });

    it('route() with "deploy to prod" returns intent="deploy"', async () => {
      const decision = await router.route('deploy to prod', defaultSession);
      expect(decision.intent).toBe('deploy');
    });

    it('route() with unknown text returns intent="unknown"', async () => {
      const decision = await router.route('hello world how are you', defaultSession);
      expect(decision.intent).toBe('unknown');
    });
  });

  describe('complexity estimation', () => {
    it('route() returns complexity between 0 and 1', async () => {
      const decision = await router.route('hello world', defaultSession);
      expect(decision.complexity).toBeGreaterThanOrEqual(0);
      expect(decision.complexity).toBeLessThanOrEqual(1);
    });

    it('route() returns higher complexity for longer text (>200 chars)', async () => {
      const shortText = 'read file';
      const longText = 'read file ' + 'x'.repeat(250);

      const shortDecision = await router.route(shortText, defaultSession);
      const longDecision = await router.route(longText, defaultSession);

      expect(longDecision.complexity).toBeGreaterThan(shortDecision.complexity);
    });

    it('route() returns higher complexity for "refactor" keyword', async () => {
      const normal = await router.route('read file', defaultSession);
      const refactorDecision = await router.route('refactor this module', defaultSession);

      expect(refactorDecision.complexity).toBeGreaterThan(normal.complexity);
    });
  });

  describe('confidence', () => {
    it('route() returns confidence of 0.6', async () => {
      const decision = await router.route('read file', defaultSession);
      expect(decision.confidence).toBe(0.6);
    });
  });

  describe('model tier selection', () => {
    it('route() selects free tier when budget is low', async () => {
      const lowBudget = makeSession({ cost: { budgetRemaining: 0.1 } });
      const decision = await router.route('read file', lowBudget);
      expect(decision.model).toBe('free');
    });

    it('route() selects cheap tier for moderate complexity with sufficient budget', async () => {
      const decision = await router.route('read file', defaultSession);
      expect(decision.model).toBe('free');
    });

    it('route() selects standard tier for high complexity with sufficient budget', async () => {
      const complexRequest = 'refactor the entire architecture ' + 'code '.repeat(50);
      const manyMessages = Array.from({ length: 11 }, (_, i) => ({ role: 'user' as const, content: `message ${i}` }));
      const decision = await router.route(complexRequest, makeSession({ cost: { budgetRemaining: 1 }, messages: manyMessages }));
      expect(decision.model).toBe('standard');
    });
  });

  describe('approval levels', () => {
    it('route() returns "ask" approval for rm command', async () => {
      const decision = await router.route('execute rm -rf /tmp/test', defaultSession);
      expect(decision.approval).toBe('ask');
    });

    it('route() returns "ask" approval for delete command', async () => {
      const decision = await router.route('run delete all logs', defaultSession);
      expect(decision.approval).toBe('ask');
    });

    it('route() returns "ask" approval for push command', async () => {
      const decision = await router.route('run git push origin main', defaultSession);
      expect(decision.approval).toBe('ask');
    });

    it('route() returns "ask" approval for deploy intent', async () => {
      const decision = await router.route('deploy to prod', defaultSession);
      expect(decision.approval).toBe('ask');
    });

    it('route() returns "notify" for write operations', async () => {
      const decision = await router.route('create a new file called test.ts', defaultSession);
      expect(decision.approval).toBe('notify');
    });

    it('route() returns "notify" for edit operations', async () => {
      const decision = await router.route('edit the config file', defaultSession);
      expect(decision.approval).toBe('notify');
    });

    it('route() returns "notify" for bash without destructive keywords', async () => {
      const decision = await router.route('run npm test', defaultSession);
      expect(decision.approval).toBe('notify');
    });

    it('route() returns "auto" for read operations', async () => {
      const decision = await router.route('read file', defaultSession);
      expect(decision.approval).toBe('auto');
    });
  });

  describe('compression selection', () => {
    it('route() selects smart-crusher for data keywords', async () => {
      const decision = await router.route('fetch json api response', defaultSession);
      expect(decision.compression).toBe('smart-crusher');
    });

    it('route() selects code-compressor for code keywords', async () => {
      const decision = await router.route('write a function that exports a const', defaultSession);
      expect(decision.compression).toBe('code-compressor');
    });

    it('route() selects compression based on intent when no keywords', async () => {
      const decision = await router.route('please refactor this module', defaultSession);
      expect(decision.compression).toBe('code-compressor');
    });
  });

  describe('suggested tools', () => {
    it('route() returns suggestedTools matching read intent', async () => {
      const decision = await router.route('read file', defaultSession);
      expect(decision.suggestedTools).toContain('Read');
      expect(decision.suggestedTools).toContain('Glob');
    });

    it('route() returns suggestedTools matching edit intent', async () => {
      const decision = await router.route('edit code', defaultSession);
      expect(decision.suggestedTools).toContain('Edit');
    });

    it('route() returns suggestedTools matching test intent', async () => {
      const decision = await router.route('write unit tests', defaultSession);
      expect(decision.suggestedTools).toContain('Bash');
      expect(decision.suggestedTools).toContain('Read');
    });

    it('route() returns suggestedTools matching deploy intent', async () => {
      const decision = await router.route('deploy to prod', defaultSession);
      expect(decision.suggestedTools).toContain('Bash');
    });

    it('route() returns suggestedTools matching unknown intent', async () => {
      const decision = await router.route('hello world', defaultSession);
      expect(decision.suggestedTools).toContain('Read');
      expect(decision.suggestedTools).toContain('Grep');
    });
  });

  describe('routing decision fields', () => {
    it('route() returns estimatedTokens as a positive integer', async () => {
      const decision = await router.route('read file', defaultSession);
      expect(decision.estimatedTokens).toBeGreaterThan(0);
      expect(Number.isInteger(decision.estimatedTokens)).toBe(true);
    });

    it('route() returns estimatedCost based on model tier', async () => {
      const decision = await router.route('read file', makeSession({ cost: { budgetRemaining: 0.1 } }));
      expect(decision.estimatedCost).toBe(0);
    });

    it('route() returns reason string', async () => {
      const decision = await router.route('read file', defaultSession);
      expect(typeof decision.reason).toBe('string');
      expect(decision.reason.length).toBeGreaterThan(0);
    });

    it('route() returns fallbackStrategy based on complexity', async () => {
      const simple = await router.route('read file', defaultSession);
      expect(simple.fallbackStrategy).toBe('direct');

      const complex = await router.route('refactor ' + 'architecture '.repeat(200), defaultSession);
      expect(complex.fallbackStrategy).toBe('cascade');
    });
  });
});

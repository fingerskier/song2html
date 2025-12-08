import { describe, test, expect } from './runner.js';
import { createStateMachine, States } from '../state.js';

describe('State Machine', () => {
  test('should start with Splash as default state', () => {
    const sm = createStateMachine();
    expect(sm.getCurrentState()).toBe(States.SPLASH);
  });

  test('should always allow transition to Splash', () => {
    const sm = createStateMachine();
    expect(sm.canTransitionTo(States.SPLASH)).toBe(true);
  });

  test('should always allow transition to Settings', () => {
    const sm = createStateMachine();
    expect(sm.canTransitionTo(States.SETTINGS)).toBe(true);
  });

  test('should successfully transition to Settings', () => {
    const sm = createStateMachine();
    const result = sm.transitionTo(States.SETTINGS);
    expect(result).toBe(true);
    expect(sm.getCurrentState()).toBe(States.SETTINGS);
  });

  test('should successfully transition back to Splash', () => {
    const sm = createStateMachine();
    sm.transitionTo(States.SETTINGS);
    const result = sm.transitionTo(States.SPLASH);
    expect(result).toBe(true);
    expect(sm.getCurrentState()).toBe(States.SPLASH);
  });
});

describe('State Machine - Credential Requirements', () => {
  test('should not have valid credentials initially', () => {
    const sm = createStateMachine();
    expect(sm.hasValidCredentials()).toBe(false);
  });

  test('should not allow Editor transition without credentials', () => {
    const sm = createStateMachine();
    expect(sm.canTransitionTo(States.EDITOR)).toBe(false);
  });

  test('should not allow Preview transition without credentials', () => {
    const sm = createStateMachine();
    expect(sm.canTransitionTo(States.PREVIEW)).toBe(false);
  });

  test('should not allow Export transition without credentials', () => {
    const sm = createStateMachine();
    expect(sm.canTransitionTo(States.EXPORT)).toBe(false);
  });

  test('should fail transition to Editor without credentials', () => {
    const sm = createStateMachine();
    const result = sm.transitionTo(States.EDITOR);
    expect(result).toBe(false);
    expect(sm.getCurrentState()).toBe(States.SPLASH);
  });

  test('should require both email AND api key for valid credentials', () => {
    const sm = createStateMachine();

    sm.setCredentials({ email: 'test@example.com' });
    expect(sm.hasValidCredentials()).toBe(false);

    sm.setCredentials({ email: null, openaiApiKey: 'sk-test123' });
    expect(sm.hasValidCredentials()).toBe(false);
  });

  test('should have valid credentials when both are set', () => {
    const sm = createStateMachine();
    sm.setCredentials({
      email: 'test@example.com',
      openaiApiKey: 'sk-test123'
    });
    expect(sm.hasValidCredentials()).toBe(true);
  });

  test('should allow Editor transition with valid credentials', () => {
    const sm = createStateMachine();
    sm.setCredentials({
      email: 'test@example.com',
      openaiApiKey: 'sk-test123'
    });
    expect(sm.canTransitionTo(States.EDITOR)).toBe(true);
    const result = sm.transitionTo(States.EDITOR);
    expect(result).toBe(true);
    expect(sm.getCurrentState()).toBe(States.EDITOR);
  });

  test('should allow Preview transition with valid credentials', () => {
    const sm = createStateMachine();
    sm.setCredentials({
      email: 'test@example.com',
      openaiApiKey: 'sk-test123'
    });
    expect(sm.canTransitionTo(States.PREVIEW)).toBe(true);
  });

  test('should allow Export transition with valid credentials', () => {
    const sm = createStateMachine();
    sm.setCredentials({
      email: 'test@example.com',
      openaiApiKey: 'sk-test123'
    });
    expect(sm.canTransitionTo(States.EXPORT)).toBe(true);
  });
});

describe('State Machine - Available States', () => {
  test('should only show Splash and Settings without credentials', () => {
    const sm = createStateMachine();
    const available = sm.getAvailableStates();
    expect(available).toContain(States.SPLASH);
    expect(available).toContain(States.SETTINGS);
    expect(available.length).toBe(2);
  });

  test('should show all states with valid credentials', () => {
    const sm = createStateMachine();
    sm.setCredentials({
      email: 'test@example.com',
      openaiApiKey: 'sk-test123'
    });
    const available = sm.getAvailableStates();
    expect(available).toContain(States.SPLASH);
    expect(available).toContain(States.SETTINGS);
    expect(available).toContain(States.EDITOR);
    expect(available).toContain(States.PREVIEW);
    expect(available).toContain(States.EXPORT);
    expect(available.length).toBe(5);
  });
});

describe('State Machine - Credential Clearing', () => {
  test('should return to Splash when credentials are cleared from restricted state', () => {
    const sm = createStateMachine();
    sm.setCredentials({
      email: 'test@example.com',
      openaiApiKey: 'sk-test123'
    });
    sm.transitionTo(States.EDITOR);
    expect(sm.getCurrentState()).toBe(States.EDITOR);

    sm.clearCredentials();
    expect(sm.getCurrentState()).toBe(States.SPLASH);
    expect(sm.hasValidCredentials()).toBe(false);
  });

  test('should stay in Settings when credentials are cleared', () => {
    const sm = createStateMachine();
    sm.setCredentials({
      email: 'test@example.com',
      openaiApiKey: 'sk-test123'
    });
    sm.transitionTo(States.SETTINGS);

    sm.clearCredentials();
    expect(sm.getCurrentState()).toBe(States.SETTINGS);
  });
});

describe('State Machine - Subscriptions', () => {
  test('should notify subscribers on state change', () => {
    const sm = createStateMachine();
    let notified = false;
    let receivedData = null;

    sm.subscribe((data) => {
      notified = true;
      receivedData = data;
    });

    sm.transitionTo(States.SETTINGS);

    expect(notified).toBe(true);
    expect(receivedData.previousState).toBe(States.SPLASH);
    expect(receivedData.currentState).toBe(States.SETTINGS);
  });

  test('should allow unsubscribing', () => {
    const sm = createStateMachine();
    let count = 0;

    const unsubscribe = sm.subscribe(() => {
      count++;
    });

    sm.transitionTo(States.SETTINGS);
    expect(count).toBe(1);

    unsubscribe();
    sm.transitionTo(States.SPLASH);
    expect(count).toBe(1);
  });
});

describe('State Machine - Reset', () => {
  test('should reset to initial state', () => {
    const sm = createStateMachine();
    sm.setCredentials({
      email: 'test@example.com',
      openaiApiKey: 'sk-test123'
    });
    sm.transitionTo(States.EDITOR);

    sm.reset();

    expect(sm.getCurrentState()).toBe(States.SPLASH);
    expect(sm.hasValidCredentials()).toBe(false);
  });
});

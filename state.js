/**
 * State machine for song2html application
 *
 * States:
 * - Splash (default): Landing/welcome screen
 * - Settings: Configuration screen (always available)
 * - Editor: Song editing (requires credentials)
 * - Preview: Song preview (requires credentials)
 * - Export: Export options (requires credentials)
 */

// Available states
export const States = {
  SPLASH: 'Splash',
  SETTINGS: 'Settings',
  EDITOR: 'Editor',
  PREVIEW: 'Preview',
  EXPORT: 'Export'
}

// States that are always accessible (no credentials required)
const ALWAYS_AVAILABLE = [States.SPLASH, States.SETTINGS]

// States that require credentials
const REQUIRES_CREDENTIALS = [States.EDITOR, States.PREVIEW, States.EXPORT]

/**
 * Create a new state machine instance
 * @returns {Object} State machine API
 */
export function createStateMachine() {
  let currentState = States.SPLASH
  let credentials = {
    email: null,
    openaiApiKey: null
  }
  let listeners = []

  /**
   * Check if credentials are valid (both email and API key are set)
   * @returns {boolean}
   */
  function hasValidCredentials() {
    return Boolean(credentials.email && credentials.openaiApiKey)
  }

  /**
   * Check if a state transition is allowed
   * @param {string} targetState - The state to transition to
   * @returns {boolean}
   */
  function canTransitionTo(targetState) {
    // Splash and Settings are always available
    if (ALWAYS_AVAILABLE.includes(targetState)) {
      return true
    }

    // Other states require valid credentials
    if (REQUIRES_CREDENTIALS.includes(targetState)) {
      return hasValidCredentials()
    }

    // Unknown state
    return false
  }

  /**
   * Get list of available states based on current credentials
   * @returns {string[]}
   */
  function getAvailableStates() {
    const available = [...ALWAYS_AVAILABLE]

    if (hasValidCredentials()) {
      available.push(...REQUIRES_CREDENTIALS)
    }

    return available
  }

  /**
   * Transition to a new state
   * @param {string} targetState - The state to transition to
   * @returns {boolean} Whether the transition was successful
   */
  function transitionTo(targetState) {
    if (!canTransitionTo(targetState)) {
      return false
    }

    const previousState = currentState
    currentState = targetState

    // Notify listeners
    listeners.forEach(listener => {
      listener({
        previousState,
        currentState,
        credentials: { ...credentials }
      })
    })

    return true
  }

  /**
   * Set user credentials
   * @param {Object} creds - Credentials object
   * @param {string} [creds.email] - User email
   * @param {string} [creds.openaiApiKey] - OpenAI API key
   */
  function setCredentials({ email, openaiApiKey }) {
    if (email !== undefined) {
      credentials.email = email || null
    }
    if (openaiApiKey !== undefined) {
      credentials.openaiApiKey = openaiApiKey || null
    }
  }

  /**
   * Get current credentials (returns copy)
   * @returns {Object}
   */
  function getCredentials() {
    return { ...credentials }
  }

  /**
   * Clear all credentials
   */
  function clearCredentials() {
    credentials.email = null
    credentials.openaiApiKey = null

    // If currently in a restricted state, go back to Splash
    if (REQUIRES_CREDENTIALS.includes(currentState)) {
      transitionTo(States.SPLASH)
    }
  }

  /**
   * Get current state
   * @returns {string}
   */
  function getCurrentState() {
    return currentState
  }

  /**
   * Subscribe to state changes
   * @param {Function} listener - Callback function
   * @returns {Function} Unsubscribe function
   */
  function subscribe(listener) {
    listeners.push(listener)
    return () => {
      listeners = listeners.filter(l => l !== listener)
    }
  }

  /**
   * Reset state machine to initial state
   */
  function reset() {
    currentState = States.SPLASH
    credentials = { email: null, openaiApiKey: null }
  }

  return {
    // State queries
    getCurrentState,
    getAvailableStates,
    canTransitionTo,
    hasValidCredentials,

    // State transitions
    transitionTo,

    // Credentials management
    setCredentials,
    getCredentials,
    clearCredentials,

    // Utilities
    subscribe,
    reset,

    // Constants
    States
  }
}

// Default export: singleton instance
const defaultStateMachine = createStateMachine()
export default defaultStateMachine

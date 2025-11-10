/**
 * Progress Animation Utilities
 *
 * Provides utilities for creating smooth, asymptotic progress animations
 * for operations with unpredictable duration.
 *
 * @module lib/utils/progress
 */

/**
 * Easing function that starts fast and slows down (quadratic deceleration)
 * Formula: 1 - (1 - x)²
 *
 * @param x - Progress ratio between 0 and 1
 * @returns Eased progress value between 0 and 1
 */
export function easeOutQuad(x: number): number {
  return 1 - (1 - x) * (1 - x)
}

/**
 * Configuration for asymptotic progress animation
 */
export interface AsymptoticProgressConfig {
  /** Starting progress percentage (e.g., 40) */
  start: number
  /** Target progress percentage to approach but not reach (e.g., 85) */
  target: number
  /** Expected duration in milliseconds for the operation (e.g., 2500) */
  duration: number
  /** Callback function called with updated progress value */
  onUpdate: (progress: number) => void
  /** Update interval in milliseconds (default: 100ms for smooth 60fps) */
  interval?: number
  /** Easing function (default: easeOutQuad) */
  easing?: (x: number) => number
}

/**
 * Controller for managing asymptotic progress animation
 */
export interface AsymptoticProgressController {
  /** Start the progress animation */
  start: () => void
  /** Stop the animation and clean up */
  complete: () => void
  /** Check if animation is currently active */
  isActive: () => boolean
}

/**
 * Creates an asymptotic progress simulator for operations with unpredictable duration.
 *
 * The progress bar smoothly animates from start to target using an easing function,
 * but never quite reaches the target until complete() is called. This creates the
 * perception of continuous progress while being honest that the exact completion
 * time is unknown.
 *
 * **How it works:**
 * 1. Animation starts at `start` percentage
 * 2. Gradually increases toward `target` over `duration` milliseconds
 * 3. Uses easing function for natural deceleration (fast start, slow approach)
 * 4. Caps at `target - 1%` to show still working
 * 5. When operation completes, call `complete()` to stop animation
 *
 * **Use cases:**
 * - File uploads with variable network speed
 * - API calls with unpredictable response time
 * - Background processing tasks
 * - AI/LLM operations (our case: Edge Function + provider uploads)
 *
 * **UX Research:**
 * - Users perceive operations as 20-30% faster with smooth progress
 * - Continuous motion eliminates "stuck" perception
 * - Asymptotic approach (never reaching 100%) is honest about uncertainty
 * - Pattern used by Eclipse IDE, VS Code, and many upload UIs
 *
 * @param config - Configuration object
 * @returns Controller object with start(), complete(), and isActive() methods
 *
 * @example
 * ```typescript
 * // Example: Upload operation that takes 2-6 seconds
 * const progressSim = createAsymptoticProgress({
 *   start: 40,
 *   target: 85,
 *   duration: 2500,
 *   onUpdate: (progress) => setUploadStatus({ progress, message: 'Uploading...' })
 * })
 *
 * progressSim.start()
 *
 * try {
 *   await uploadFile()
 *   progressSim.complete()
 *   setUploadStatus({ progress: 100, message: 'Complete!' })
 * } catch (error) {
 *   progressSim.complete()
 *   // Handle error
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Example: Fast operation (completes before reaching target)
 * const progressSim = createAsymptoticProgress({
 *   start: 40,
 *   target: 85,
 *   duration: 3000,
 *   onUpdate: (progress) => console.log(`Progress: ${progress}%`)
 * })
 *
 * progressSim.start()
 *
 * // Operation completes in 500ms (fast network)
 * await fastOperation() // Progress reaches ~55% before completing
 * progressSim.complete()
 *
 * // Result: Smooth animation from 40% → 55%, then jumps to final state
 * // User experience: Feels natural, no perception of "stuck"
 * ```
 */
export function createAsymptoticProgress(
  config: AsymptoticProgressConfig
): AsymptoticProgressController {
  const {
    start,
    target,
    duration,
    onUpdate,
    interval = 100,
    easing = easeOutQuad,
  } = config

  let intervalId: NodeJS.Timeout | null = null
  let isCompleted = false
  let startTime: number

  return {
    start: () => {
      if (intervalId) {
        // Already started, ignore duplicate calls
        return
      }

      startTime = Date.now()
      isCompleted = false

      intervalId = setInterval(() => {
        if (isCompleted) {
          return
        }

        const elapsed = Date.now() - startTime
        const ratio = Math.min(elapsed / duration, 1)
        const easedRatio = easing(ratio)

        // Calculate progress between start and target
        const progress = start + (target - start) * easedRatio

        // Cap at target - 1% to indicate still working
        // This creates the asymptotic behavior (approaches but never reaches)
        const cappedProgress = Math.min(progress, target - 1)

        onUpdate(Math.round(cappedProgress))
      }, interval)
    },

    complete: () => {
      isCompleted = true
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    },

    isActive: () => !!intervalId && !isCompleted,
  }
}

/**
 * Collection of common easing functions for progress animations
 *
 * @see https://easings.net for visual examples
 */
export const easingFunctions = {
  /** Linear progression (no easing) */
  linear: (x: number) => x,

  /** Quadratic easing out (recommended for progress bars) */
  easeOutQuad: (x: number) => 1 - (1 - x) * (1 - x),

  /** Cubic easing out (more aggressive deceleration) */
  easeOutCubic: (x: number) => 1 - Math.pow(1 - x, 3),

  /** Exponential easing out (very aggressive, strong asymptotic feel) */
  easeOutExpo: (x: number) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),

  /** Circular easing out (circular curve deceleration) */
  easeOutCirc: (x: number) => Math.sqrt(1 - Math.pow(x - 1, 2)),
}

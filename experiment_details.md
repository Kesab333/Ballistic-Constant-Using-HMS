# Hibbert Magnetic-Standard / Ballistic Galvanometer Experiment

## 1. Overview
This project is an interactive, browser-based physics simulation of the Hibbert magnetic-standard / ballistic-galvanometer experiment. It allows users to manipulate standard laboratory apparatus (a magnetic standard, resistance box, commutator, tapping switch, and ballistic galvanometer) to explore the principles of electromagnetic induction, charge measurement, and damped harmonic motion.

## 2. Development Methods and Technologies
The application is built entirely using standard Web technologies without relying on heavyweight game engines, prioritizing performance and accessibility:
- **HTML5:** Provides the structural foundation and interactive UI elements (canvas, buttons, input fields).
- **CSS3 (Vanilla):** Used for styling, layout (Flexbox/Grid), and visual aesthetics (e.g., custom properties for dynamic theming, smooth transitions). No external CSS frameworks are used, ensuring a lightweight footprint.
- **JavaScript (ES6+):** Handles all application logic, including the core physics simulation, event-driven state management, interactive canvas rendering, and UI synchronization. It is modularized into different files (`physics.js`, `ballistic-galvanometer.js`, etc.) for separation of concerns.

## 3. Physics & Mathematics Logic

The simulation relies on real-world physics principles, governed by the following mathematical models:

### 3.1. Electromagnetic Induction (Faraday's Law)
When the Hibbert Magnetic Standard (HMS) coil is released, it drops through a magnetic field, changing the magnetic flux ($\Phi$) and inducing an Electromotive Force ($\mathcal{E}$).
- **Flux Map:** The flux at a position is modeled as a smooth transition:
  $\Phi_{pos} = \Phi_{max} \cdot u^2 \cdot (3 - 2u)$ where $u$ is the normalized position in the field.
- **Induced EMF:**
  $\mathcal{E} = -n \frac{d\Phi}{dt}$ (where $n$ is the number of turns).
- **Induced Current ($I$):**
  $I = \frac{\pm \mathcal{E}}{R_{total}}$ (polarity determined by the commutator, $R_{total}$ is the sum of external, galvanometer, and HMS winding resistance).
- **Total Charge ($Q$):**
  $Q = \int I dt = \frac{n \Phi_{max}}{R_{total}}$

### 3.2. Ballistic Galvanometer Mechanics (Damped Harmonic Motion)
The galvanometer coil experiences a torque proportional to the current, opposed by a restoring torsional spring and damping (air/electromagnetic).
- **Equation of Motion:**
  $J \frac{d^2\theta}{dt^2} + c \frac{d\theta}{dt} + S\theta = K_t I(t)$
  Where:
  - $J$ = Moment of inertia
  - $c$ = Damping coefficient
  - $S$ = Torsional constant
  - $K_t$ = Torque constant
- **Angular Frequency ($\omega_d$) and Damping ($\beta$):**
  $\beta = \frac{c}{2J}$
  $\omega_0 = \sqrt{\frac{S}{J}}$
  $\omega_d = \sqrt{\omega_0^2 - \beta^2}$
- **Period of Oscillation ($T$):**
  $T = \frac{2\pi}{\omega_d}$

### 3.3. Damping Correction (Logarithmic Decrement)
Because the galvanometer is damped, the observed maximum throw ($\theta_1$) is smaller than the theoretical undamped throw. The simulation corrects for this using the first ($\theta_1$) and third ($\theta_3$) throws on the same side.
- **Corrected Throw ($\theta_0$):**
  $\theta_0 = \theta_1 \left( \frac{\theta_1}{\theta_3} \right)^{1/4}$

### 3.4. Calibration and Linear Regression
To calibrate the ballistic constant ($K$) and find the internal resistance of the galvanometer circuit, the experiment takes readings at varying external resistances ($R$).
- **Ballistic Constant ($K$):** Evaluated across pairs of trials.
- **Linear Regression:** A least-squares fit is applied to the points $(R, 1/\theta_0)$ to determine the slope and intercept, from which the internal resistance can be extrapolated:
  $R_{internal} = \frac{\text{Intercept}}{\text{Slope}}$

## 4. Software Architecture summary
- `physics.js`: Core numerical integration (Euler/Runge-Kutta step for the differential equations of motion), circuit state evaluation, and physical derivations.
- Component JS files (e.g. `resistance-box.js`, `commutator.js`): Manage the logical state and rendering/interaction logic for individual apparatuses.
- Central Event Bus: Custom events (e.g., `ballistic:statechange`) decouple the simulation engine from the UI rendering layer, enabling a responsive and reactive interface.

# LAST CHANCE

A single-player, completely offline 3D precision platformer set inside an abandoned research facility. Navigate deceptive *Level Devil*-style traps to rescue your younger sister.

## Technology Stack

- **3D Rendering**: Three.js (PBR materials, procedural textures, `RoomEnvironment` IBL, dynamic quality tiers)
- **Physics**: Rapier 3D (`@dimforge/rapier3d-compat` kinematic character controller & rigid bodies)
- **Frontend**: TypeScript, React 19, Vite, Tailwind CSS
- **Mobile Runtime**: Capacitor Android (`com.lastchance.game`, landscape-locked)
- **CI/CD**: GitHub Actions signed APK pipeline (`last-chance.apk`)

## Prototype Gameplay (Sector 01: Containment Corridor)

- **Male Protagonist**: Articulated 3D character with walk, run, jump, fall, and ragdoll collapse animations.
- **Third-Person Follow Camera**: Smooth exponentially damped tracking camera.
- **Controls**:
  - **Mobile Touch**: Multi-touch virtual joystick (inner walk ring / outer run ring), precision Walk toggle, and Jump button.
  - **Desktop Keyboard**: `WASD` or `Arrow Keys` to move, hold `Shift` to walk carefully, `Space` to jump, `R` to retry, `Esc`/`P` to pause.
- **Deceptive Traps**:
  1. **Hidden Floor Spikes** triggered beneath concrete seam plates.
  2. **Collapsing Catwalk Platforms** that rattle and drop into the chasm.
  3. **Moving Machinery** (sweeping hydraulic pistons & pendulum saw).
  4. **Fake Exit Decoy** ("LOCKDOWN" trapdoor twist revealing the true Airlock B-2 extraction gantry where your sister awaits).
- **Checkpoints & Offline Saves**: Progress, best clear times, death counts, and Low/Medium/High + 30 FPS performance preferences persist offline in local storage.

## Persistent Android Signing Setup (For Update Compatibility)

To ensure every APK built by GitHub Actions can be installed over previous versions of `com.lastchance.game` without uninstalling or losing local save data:

1. **Generate ONE persistent release keystore locally** (never commit `.jks` files to Git):
   ```bash
   keytool -genkey -v -keystore lastchance-release.jks -alias lastchance -keyalg RSA -keysize 2048 -validity 10000
   ```
2. **Base64-encode the keystore**:
   ```bash
   base64 -w 0 lastchance-release.jks
   ```
3. **Add these 4 Repository Secrets** in GitHub (`Settings -> Secrets and variables -> Actions`):
   - `ANDROID_KEYSTORE_BASE64` — Base64 output from step 2
   - `ANDROID_KEYSTORE_PASSWORD` — Keystore password
   - `ANDROID_KEY_ALIAS` — Key alias (e.g. `lastchance`)
   - `ANDROID_KEY_PASSWORD` — Key password

Every push to `main` automatically increments `versionCode`, signs `last-chance.apk` with the same certificate, and uploads it as a workflow artifact.

## Local Development

```bash
npm install
npm run dev
npm run build
npm run cap:sync
```

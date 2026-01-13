# AI Model Download Changes

## Summary
Modified the application to prevent automatic AI model downloads and require user confirmation before enabling the AI assistant feature.

## Changes Made

### 1. Server-side Changes (`server/index.js`)

#### Disabled Auto-initialization
- **Line 41-42**: Commented out automatic AI model loading on server startup
- The AI model will now only load when explicitly requested by a user

#### Added AI Status Endpoint
- **New endpoint**: `GET /api/ai/status`
- Returns:
  - `initialized`: Boolean indicating if AI is loaded
  - `modelSize`: "~700MB"
  - `modelName`: "Llama-3.2-1B-Instruct-ONNX"

#### Added AI Initialization Endpoint
- **New endpoint**: `POST /api/ai/initialize`
- Allows on-demand initialization of the AI model
- Returns success/error status

#### Fixed Sharp Module Issue
- Added `libvips-dev` installation in Dockerfile runtime stage
- Added `npm rebuild sharp` to ensure correct platform binaries
- This fixes the "sharp module using the linux-x64 runtime" error

### 2. Client-side Changes (`src/App.jsx`)

#### Changed Default AI State
- **Line 3031**: Changed default `localAiEnabled` from `true` to `false`
- Users must now explicitly enable AI

#### Updated Settings Panel
- **Line 1632**: Added `showGenericConfirm` and `showToast` props to SettingsPanel
- **Lines 1724-1760**: Replaced simple toggle with confirmation dialog
- When enabling AI, users now see:
  - Warning about ~700MB download
  - Warning about CPU usage
  - Information that download happens in background
  - Confirmation and cancel buttons

#### Updated Description
- Changed "tiny local model" to "server-side model" for accuracy

### 3. Dockerfile Changes

#### Runtime Dependencies
- Added `libvips-dev` package installation
- Added `npm rebuild sharp` command
- Ensures sharp module works correctly in Docker container

## User Experience Flow

### Before (Old Behavior)
1. Server starts → AI model automatically downloads (~700MB)
2. AI is enabled by default for all users
3. No warning about resource usage

### After (New Behavior)
1. Server starts → No AI model download
2. AI is disabled by default
3. User goes to Settings → Toggles AI Assistant
4. **Confirmation dialog appears** with:
   - "Enable AI Assistant?"
   - "This will download a ~700MB AI model (Llama-3.2-1B) to the server and may use significant CPU resources. The download will happen in the background. Continue?"
   - "Enable AI" and "Cancel" buttons
5. If user confirms:
   - AI is enabled
   - Toast notification: "AI Assistant enabled. Model will download on first use."
   - Model downloads when user first uses AI feature
6. If user cancels:
   - AI remains disabled
   - No download occurs

## Benefits

1. **Reduced Initial Load**: Server starts faster without downloading AI model
2. **User Control**: Users explicitly opt-in to AI features
3. **Transparency**: Users are informed about download size and resource usage
4. **Bandwidth Savings**: Model only downloads if user wants to use AI
5. **Docker Image Size**: Base image remains lighter without pre-downloaded model

## Technical Notes

- AI model is cached in `/app/data/ai-cache` directory in Docker
- Model uses 4-bit quantization (~700MB instead of ~2.8GB)
- First AI query after enabling will trigger model download
- Subsequent queries use cached model

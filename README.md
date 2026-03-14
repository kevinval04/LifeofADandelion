# Life of a Dandelion

An interactive 3D simulation showcasing the life cycle of a dandelion, built with Three.js. Experience the journey from seed to flower through various growth stages, complete with environmental interactions like wind, bees, and dynamic weather.

## Features

- **Interactive Growth Stages**: Watch a dandelion grow from seed to full bloom
- **Environmental Effects**:
  - Dynamic wind simulation affecting dandelion seeds
  - Animated bees with realistic flight patterns
  - Cloud formations with collision detection
  - Seasonal color changes
- **Advanced Graphics**:
  - Dynamic shadowing from the sun throughout the growth process
  - Beautifully rendered 3D scene with real-time shadows
  - Advanced collision detection with clouds
- **Audio Experience**: Ambient sounds and background music enhance immersion
- **Rich Interactions**: Multiple interactive elements throughout the scene

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/LifeofADandelion.git
cd LifeofADandelion
```

2. Install dependencies:
```bash
npm install
```

## Running the Project

### Development Mode
Start the development server with hot-reload:
```bash
npm run dev
```
The application will open at `http://localhost:5173` (or another port if 5173 is busy)

### Production Build
Build the project for production:
```bash
npm run build
```

### Preview Production Build
Preview the production build locally:
```bash
npm run preview
```

## Project Structure

```
LifeofADandelion/
├── src/
│   ├── main.js         # Main application logic and Three.js scene setup
│   ├── counter.js      # Additional functionality
│   └── style.css       # Application styles
├── public/
│   └── vite.svg        # Public assets
├── index.html          # Entry HTML file
├── package.json        # Project dependencies and scripts
└── README.md           # This file
```

## Technologies Used

- **Three.js**: 3D graphics library for WebGL rendering
- **Vite**: Fast build tool and development server
- **JavaScript (ES6+)**: Modern JavaScript for application logic
- **CSS**: Styling for the user interface

## Browser Compatibility

This project works best on modern browsers with WebGL support:
- Chrome (recommended)
- Firefox
- Safari
- Edge

## Controls

Instructions are displayed in the top right corner of the screen during gameplay.

- **Click on Mound**: Plant or interact with the dandelion
- **Click on Seeds**: Interact with dandelion seeds when ready
- **Click on Sun**: Interact with the sun
- **Drag Clouds**: Click and drag to move clouds across the sky
- **Mouse Movement**: Control wind direction and strength for seed dispersal
- **Wait**: Watch the natural growth progression

## Acknowledgments
**Project Team**: Kaya Lash, Kentaro Lawrence, Kevin Valencia
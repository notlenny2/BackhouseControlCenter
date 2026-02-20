import React from 'react';

export default function CameraView({ scenes = [], currentScene, screenshot, onSceneSelect }) {
  // Default camera scene names to show as quick buttons
  const cameraScenes = scenes.length > 0 ? scenes : ['Camera 1', 'Camera 2', 'Camera 3', 'Multi'];

  return (
    <div style={styles.container}>
      {/* Live preview */}
      <div style={styles.preview}>
        {screenshot ? (
          <img src={screenshot} alt="OBS Preview" style={styles.previewImg} />
        ) : (
          <div style={styles.noPreview}>
            <div style={styles.noPreviewIcon}>📷</div>
            <div style={styles.noPreviewText}>
              {currentScene ? `Scene: ${currentScene}` : 'No preview'}
            </div>
          </div>
        )}
        {currentScene && (
          <div style={styles.sceneLabel}>{currentScene}</div>
        )}
      </div>

      {/* Scene buttons */}
      <div style={styles.sceneGrid}>
        {cameraScenes.map((scene) => (
          <button
            key={scene}
            onClick={() => onSceneSelect(scene)}
            style={{
              ...styles.sceneBtn,
              ...(scene === currentScene ? styles.sceneBtnActive : {}),
            }}
          >
            {scene}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  preview: {
    position: 'relative',
    background: '#0a0a0a',
    borderRadius: 8,
    border: '1px solid #2a2a2a',
    aspectRatio: '16 / 9',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImg: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  noPreview: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  noPreviewIcon: {
    fontSize: 32,
    opacity: 0.3,
  },
  noPreviewText: {
    fontSize: 13,
    color: '#555',
  },
  sceneLabel: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    background: 'rgba(0,0,0,0.7)',
    color: '#fff',
    fontSize: 12,
    padding: '3px 8px',
    borderRadius: 4,
    fontWeight: 600,
  },
  sceneGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
  },
  sceneBtn: {
    background: '#1a1a1a',
    color: '#ccc',
    fontSize: 14,
    fontWeight: 600,
    padding: '14px 8px',
    borderRadius: 8,
    border: '2px solid #2a2a2a',
    minHeight: 52,
    transition: 'all 0.15s',
  },
  sceneBtnActive: {
    background: 'rgba(240,165,0,0.15)',
    border: '2px solid #f0a500',
    color: '#f0a500',
  },
};

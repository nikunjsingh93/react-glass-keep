import React, { useRef, useEffect, useState, useCallback } from 'react';

const DRAWING_COLORS = [
  '#000000', // black
  '#FFFFFF', // white
  '#FF0000', // red
  '#00FF00', // green
  '#0000FF', // blue
  '#FFFF00', // yellow
  '#FF00FF', // magenta
  '#00FFFF', // cyan
  '#FFA500', // orange
  '#800080', // purple
  '#FFC0CB', // pink
  '#A52A2A', // brown
  '#808080', // gray
];

const PEN_SIZES = [1, 2, 4, 8, 12, 16, 24, 32];

function DrawingCanvas({ data, onChange, width = 800, height = 600, readOnly = false, darkMode = false, hideModeToggle = false, initialMode = null }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('pen'); // 'pen' or 'eraser'
  const [color, setColor] = useState(darkMode ? '#FFFFFF' : '#000000');
  const [size, setSize] = useState(4);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState(null);
  // Determine initial mode: use initialMode prop if provided, otherwise draw mode for composer, view mode for modal
  const getInitialMode = () => {
    if (initialMode !== null) return initialMode;
    if (readOnly) return 'view';
    if (hideModeToggle) return 'draw'; // Composer - always draw mode
    return 'view'; // Modal - default to view mode
  };
  const [mode, setMode] = useState(getInitialMode());
  const [canvasWidth, setCanvasWidth] = useState(width);
  const [canvasHeight, setCanvasHeight] = useState(height);

  // Load drawing data when component mounts or data changes
  useEffect(() => {
    let pathsData = [];
    let dimensions = null;

    // Handle both old format (array) and new format (object with paths and dimensions)
    if (data) {
      if (Array.isArray(data)) {
        // Old format: just an array of paths
        pathsData = data;
      } else if (data.paths && Array.isArray(data.paths)) {
        // New format: object with paths and dimensions
        pathsData = data.paths;
        if (data.dimensions) {
          dimensions = data.dimensions;
        }
      }
    }

    // Apply dimensions if available, otherwise reset to props (for new/old drawings)
    if (dimensions && dimensions.width && dimensions.height) {
      setCanvasWidth(dimensions.width);
      setCanvasHeight(dimensions.height);
    } else {
      // Reset to initial props for old format drawings or new drawings
      setCanvasWidth(width);
      setCanvasHeight(height);
    }

    // Convert black/white strokes based on current theme for optimal contrast
    const convertedData = pathsData.map(path => {
      // Only convert black/white strokes for better contrast, keep other colors as-is
      if (darkMode) {
        // In dark mode, ensure black strokes are white for visibility
        if (path.color === '#000000') {
          return { ...path, color: '#FFFFFF' };
        }
      } else {
        // In light mode, ensure white strokes are black for visibility
        if (path.color === '#FFFFFF') {
          return { ...path, color: '#000000' };
        }
      }
      return path;
    });
    setPaths(convertedData);
  }, [data, darkMode]);

  // Update default color when dark mode changes
  useEffect(() => {
    setColor(darkMode ? '#FFFFFF' : '#000000');
  }, [darkMode]);


  // Notify parent of changes (include dimensions)
  const notifyChange = useCallback((newPaths) => {
    if (onChange) {
      // Get current dimensions to preserve originalHeight if it exists
      let originalHeight = height; // Default to initial prop
      if (data && typeof data === 'object' && !Array.isArray(data) && data.dimensions) {
        originalHeight = data.dimensions.originalHeight || height;
      }
      
      // Send both paths and dimensions
      onChange({
        paths: newPaths,
        dimensions: {
          width: canvasWidth,
          height: canvasHeight,
          originalHeight: originalHeight
        }
      });
    }
  }, [onChange, canvasWidth, canvasHeight, data, height]);

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showColorPicker && !event.target.closest('.color-picker-container')) {
        setShowColorPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorPicker]);

  // Update canvas size when width/height props change (only if no dimensions in data)
  // This ensures props are used for initial size, but dimensions from data take precedence
  useEffect(() => {
    // Only update from props if we don't have dimensions in the current data
    if (data && typeof data === 'object' && !Array.isArray(data) && data.dimensions) {
      // Data has dimensions, don't override with props
      return;
    }
    setCanvasWidth(width);
    setCanvasHeight(height);
  }, [width, height, data]);

  // Redraw canvas when paths change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw all completed paths
    paths.forEach(path => {
      if (path.points && path.points.length > 0) {
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (path.tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
        } else {
          ctx.globalCompositeOperation = 'source-over';
        }

        ctx.beginPath();
        ctx.moveTo(path.points[0].x, path.points[0].y);

        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x, path.points[i].y);
        }

        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    });

    // Draw current path being drawn
    if (currentPath && currentPath.points && currentPath.points.length > 0) {
      ctx.strokeStyle = currentPath.color;
      ctx.lineWidth = currentPath.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (currentPath.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
      } else {
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.beginPath();
      ctx.moveTo(currentPath.points[0].x, currentPath.points[0].y);

      for (let i = 1; i < currentPath.points.length; i++) {
        ctx.lineTo(currentPath.points[i].x, currentPath.points[i].y);
      }

      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }, [paths, currentPath, canvasWidth, canvasHeight]);

  const getCanvasCoordinates = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Handle both mouse and touch events
    const clientX = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
    const clientY = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const startDrawing = useCallback((e) => {
    if (readOnly || mode !== 'draw') return;

    const point = getCanvasCoordinates(e);
    const newPath = {
      tool,
      color: tool === 'eraser' ? '#FFFFFF' : color,
      size,
      points: [point],
    };

    setCurrentPath(newPath);
    setIsDrawing(true);
  }, [readOnly, mode, tool, color, size, getCanvasCoordinates]);

  // Throttle draw updates to prevent excessive CPU usage
  const lastDrawTime = useRef(0);
  const draw = useCallback((e) => {
    if (!isDrawing || readOnly || mode !== 'draw') return;

    const now = Date.now();
    if (now - lastDrawTime.current < 16) return; // Throttle to ~60fps
    lastDrawTime.current = now;

    const point = getCanvasCoordinates(e);
    setCurrentPath(prev => ({
      ...prev,
      points: [...prev.points, point],
    }));
  }, [isDrawing, readOnly, mode, getCanvasCoordinates]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing || readOnly || mode !== 'draw') return;

    if (currentPath && currentPath.points.length > 0) {
      const newPaths = [...paths, currentPath];
      setPaths(newPaths);
      notifyChange(newPaths);
    }

    setCurrentPath(null);
    setIsDrawing(false);
  }, [isDrawing, readOnly, mode, currentPath, paths, notifyChange]);

  const clearCanvas = useCallback(() => {
    if (readOnly || mode !== 'draw') return;
    setPaths([]);
    notifyChange([]);
  }, [readOnly, mode, notifyChange]);

  const undo = useCallback(() => {
    if (readOnly || mode !== 'draw') return;
    const newPaths = paths.slice(0, -1);
    setPaths(newPaths);
    notifyChange(newPaths);
  }, [readOnly, mode, paths, notifyChange]);

  const addPage = useCallback(() => {
    if (readOnly || mode !== 'draw') return;
    // Only double the height (add page below)
    const newHeight = canvasHeight * 2;
    setCanvasHeight(newHeight);
    // Stay in draw mode to continue editing
    // Notify parent of the dimension change with updated dimensions
    if (onChange) {
      // Get current dimensions to preserve originalHeight if it exists
      let originalHeight = height; // Default to initial prop
      if (data && typeof data === 'object' && !Array.isArray(data) && data.dimensions) {
        originalHeight = data.dimensions.originalHeight || height;
      }
      
      onChange({
        paths: paths,
        dimensions: {
          width: canvasWidth,
          height: newHeight,
          originalHeight: originalHeight // Store the original first page height
        }
      });
    }
  }, [readOnly, mode, paths, canvasWidth, canvasHeight, onChange, data, height]);

  return (
    <div className="drawing-canvas-container">
      {/* View/Draw Mode Toggle - only when drawing is allowed and not hidden */}
      {!readOnly && !hideModeToggle && (
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setMode(mode === 'view' ? 'draw' : 'view')}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
            title={mode === 'view' ? 'Switch to Draw mode' : 'Switch to View mode'}
          >
            {mode === 'view' ? 'Draw mode' : 'View mode'}
          </button>
        </div>
      )}

      {/* Compact Toolbar */}
      {!readOnly && mode === 'draw' && (
        <div className="flex items-center gap-3 mb-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
          {/* Tool selection */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTool('pen')}
              className={`px-2 py-1 rounded text-sm ${tool === 'pen' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
              title="Pen"
            >
              ✏️
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`px-2 py-1 rounded text-sm ${tool === 'eraser' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
              title="Eraser"
            >
              🧽
            </button>
          </div>

          {/* Color picker dropdown */}
          {tool === 'pen' && (
            <div className="relative color-picker-container">
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="flex items-center gap-1 px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
                title="Change color"
              >
                <div
                  className="w-4 h-4 rounded border border-gray-400"
                  style={{ backgroundColor: color }}
                />
                <span>▼</span>
              </button>

              {showColorPicker && (
                <div className="absolute top-full mt-1 p-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10 min-w-[200px]">
                  <div className="grid grid-cols-6 gap-2">
                    {DRAWING_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => {
                          setColor(c);
                          setShowColorPicker(false);
                        }}
                        className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-gray-600 ring-2 ring-gray-400' : 'border-gray-300'}`}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Size picker */}
          <select
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-sm"
            title="Brush size"
          >
            {PEN_SIZES.map(s => (
              <option key={s} value={s}>{s}px</option>
            ))}
          </select>

          {/* Actions */}
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={undo}
              disabled={paths.length === 0}
              className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-sm disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-600"
              title="Undo"
            >
              ↶
            </button>
            <button
              onClick={clearCanvas}
              className="px-2 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
              title="Clear all"
            >
              🗑️
            </button>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className={`block ${mode === 'draw' && !readOnly ? 'cursor-crosshair' : 'cursor-default'}`}
          style={{ 
            maxWidth: '100%', 
            height: 'auto', 
            touchAction: mode === 'draw' && !readOnly ? 'none' : 'auto' 
          }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={(e) => {
            // Only prevent default and handle drawing in draw mode
            if (mode === 'draw' && !readOnly) {
              e.preventDefault();
              startDrawing(e);
            }
            // In view mode, allow normal touch scrolling
          }}
          onTouchMove={(e) => {
            // Only prevent default and handle drawing in draw mode
            if (mode === 'draw' && !readOnly) {
              e.preventDefault();
              draw(e);
            }
            // In view mode, allow normal touch scrolling
          }}
          onTouchEnd={(e) => {
            // Only prevent default and handle drawing in draw mode
            if (mode === 'draw' && !readOnly) {
              e.preventDefault();
              stopDrawing();
            }
            // In view mode, allow normal touch scrolling
          }}
        />
      </div>

      {/* Add Page Button - only in draw mode */}
      {!readOnly && mode === 'draw' && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={addPage}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium transition-colors"
            title="Double the canvas size to add more space for notes"
          >
            Add Page
          </button>
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-gray-500 mt-2">
        {paths.length} stroke{paths.length !== 1 ? 's' : ''}
        {mode === 'view' && ' (view mode)'}
        {readOnly && mode === 'draw' && ' (read-only)'}
      </div>
    </div>
  );
}

export default DrawingCanvas;

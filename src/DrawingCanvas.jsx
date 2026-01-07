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

function DrawingCanvas({ data, onChange, width = 800, height = 600, readOnly = false, darkMode = false }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('pen'); // 'pen' or 'eraser'
  const [color, setColor] = useState(darkMode ? '#FFFFFF' : '#000000');
  const [size, setSize] = useState(4);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState(null);

  // Load drawing data when component mounts or data changes
  useEffect(() => {
    if (data && Array.isArray(data)) {
      // Convert black/white strokes based on current theme for optimal contrast
      const convertedData = data.map(path => {
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
    } else {
      setPaths([]);
    }
  }, [data, darkMode]);

  // Update default color when dark mode changes
  useEffect(() => {
    setColor(darkMode ? '#FFFFFF' : '#000000');
  }, [darkMode]);


  // Notify parent of changes
  const notifyChange = useCallback((newPaths) => {
    if (onChange) {
      onChange(newPaths);
    }
  }, [onChange]);

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

  // Redraw canvas when paths change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

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
  }, [paths, currentPath, width, height]);

  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e) => {
    if (readOnly) return;

    const point = getCanvasCoordinates(e);
    const newPath = {
      tool,
      color: tool === 'eraser' ? '#FFFFFF' : color,
      size,
      points: [point],
    };

    setCurrentPath(newPath);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing || readOnly) return;

    const point = getCanvasCoordinates(e);
    setCurrentPath(prev => ({
      ...prev,
      points: [...prev.points, point],
    }));
  };

  const stopDrawing = () => {
    if (!isDrawing || readOnly) return;

    if (currentPath && currentPath.points.length > 0) {
      const newPaths = [...paths, currentPath];
      setPaths(newPaths);
      notifyChange(newPaths);
    }

    setCurrentPath(null);
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    if (readOnly) return;
    setPaths([]);
    notifyChange([]);
  };

  const undo = () => {
    if (readOnly) return;
    const newPaths = paths.slice(0, -1);
    setPaths(newPaths);
    notifyChange(newPaths);
  };

  return (
    <div className="drawing-canvas-container">
      {/* Compact Toolbar */}
      {!readOnly && (
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
                <span>🖌️</span>
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
          width={width}
          height={height}
          className={`block ${!readOnly ? 'cursor-crosshair' : 'cursor-default'}`}
          style={{ maxWidth: '100%', height: 'auto' }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
        />
      </div>

      {/* Info */}
      <div className="text-xs text-gray-500 mt-2">
        {paths.length} stroke{paths.length !== 1 ? 's' : ''}
        {readOnly && ' (read-only)'}
      </div>
    </div>
  );
}

export default DrawingCanvas;

import React, {Children, useLayoutEffect, useRef} from 'react';

// Keep DOM/tab order while placing each next note in the shortest column.
export default function NoteLayout({listView, children}) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const grid = ref.current;
    if (listView || !grid) return;
    const arrange = () => {
      const columns = Number(getComputedStyle(grid).getPropertyValue('--note-columns')) || 1;
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 24;
      const width = (grid.clientWidth - gap * (columns - 1)) / columns;
      if (width <= 0) return;
      const cells = [...grid.children];
      cells.forEach(cell => { cell.style.width = `${width}px`; });
      const heights = cells.map(cell => cell.firstElementChild?.offsetHeight || 0);
      const bottoms = Array(columns).fill(0);
      cells.forEach((cell, index) => {
        const column = bottoms.indexOf(Math.min(...bottoms));
        cell.style.left = `${column * (width + gap)}px`;
        cell.style.top = `${bottoms[column]}px`;
        bottoms[column] += heights[index] + gap;
      });
      grid.style.height = `${Math.max(0, ...bottoms) - (cells.length ? gap : 0)}px`;
    };
    arrange();
    const observer = new ResizeObserver(arrange);
    observer.observe(grid);
    [...grid.children].forEach(cell => { if (cell.firstElementChild) observer.observe(cell.firstElementChild); });
    return () => observer.disconnect();
  }, [children, listView]);

  return listView
    ? <div className="max-w-2xl mx-auto space-y-6">{children}</div>
    : <div ref={ref} className="masonry-grid">{Children.toArray(children).map(child => <div key={child.key} className="masonry-item">{child}</div>)}</div>;
}

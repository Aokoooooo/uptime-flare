import { useEffect, useMemo, useRef, useState } from 'react'
import UplotReact from 'uplot-react'
import type uPlot from 'uplot'
import type { LatencyRecord } from '../../types/config'
import { codeToCountry } from '../../util/iata'

export function LatencyChart({ points }: { points: LatencyRecord[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(840)
  const chartEnd = points.at(-1)?.time ?? Math.round(Date.now() / 1000)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateWidth = () => setWidth(Math.max(220, Math.floor(element.clientWidth)))
    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const data = useMemo<uPlot.AlignedData>(() => {
    return [points.map((point) => point.time), points.map((point) => point.ping)]
  }, [points])

  const options = useMemo<uPlot.Options>(
    () => ({
      width,
      height: width < 520 ? 132 : 160,
      padding: [10, 8, 0, 0],
      scales: {
        x: {
          time: true,
          min: chartEnd - 12 * 60 * 60,
          max: chartEnd,
        },
      },
      axes: [
        {
          stroke: '#8b9bb7',
          grid: { stroke: '#223047', width: 1 },
        },
        {
          stroke: '#8b9bb7',
          grid: { stroke: '#223047', width: 1 },
          size: 64,
          values: (_u, vals) => vals.map((v) => `${v}ms`),
        },
      ],
      cursor: {
        drag: { x: false, y: false },
      },
      series: [
        {},
        {
          label: '响应时间',
          stroke: '#38bdf8',
          width: 2,
          points: { show: false },
          value: (_u, value, index) => {
            if (value == null) return '--'
            const point = typeof index === 'number' ? points[index] : undefined
            return point ? `${value}ms (${codeToCountry(point.loc)})` : `${value}ms`
          },
        },
      ],
    }),
    [chartEnd, points, width]
  )

  return (
    <div className="chart" ref={containerRef}>
      <UplotReact options={options} data={data} target={undefined} />
    </div>
  )
}

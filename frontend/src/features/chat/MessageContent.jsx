import { Fragment } from 'react'

function inlineContent(text) {
  return text.split(/(\*\*[^*]+\*\*|<br\s*\/?\s*>)/gi).map((part, index) => {
    if (/^<br\s*\/?\s*>$/i.test(part)) return <br key={index} />
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    return <Fragment key={index}>{part}</Fragment>
  })
}

function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function isDivider(line, count) {
  const parts = cells(line)
  return parts.length === count && parts.every((part) => /^:?-{3,}:?$/.test(part))
}

export default function MessageContent({ content }) {
  const lines = content.split(/\r?\n/)
  const blocks = []
  let paragraph = []

  function flushParagraph() {
    if (paragraph.length) {
      blocks.push(<p key={blocks.length}>{paragraph.map((line, index) => (
        <Fragment key={index}>{index > 0 && <br />}{inlineContent(line)}</Fragment>
      ))}</p>)
      paragraph = []
    }
  }

  for (let index = 0; index < lines.length; index++) {
    const headers = cells(lines[index])
    if (lines[index].includes('|') && index + 1 < lines.length && isDivider(lines[index + 1], headers.length)) {
      flushParagraph()
      const rows = []
      index += 2
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(cells(lines[index]))
        index++
      }
      blocks.push(
        <div className="message-table-scroll" key={blocks.length}>
          <table>
            <thead><tr>{headers.map((header, cellIndex) => <th key={cellIndex} scope="col">{inlineContent(header)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex}>{inlineContent(row[cellIndex] || '')}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      )
      index--
    } else if (!lines[index].trim()) {
      flushParagraph()
    } else {
      paragraph.push(lines[index])
    }
  }
  flushParagraph()

  return <div className="message-content">{blocks}</div>
}

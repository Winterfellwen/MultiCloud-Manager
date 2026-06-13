import { X, File, Download } from 'lucide-react'
import type { FileItem } from '../../api/types'

interface FilesSidebarProps {
  open: boolean
  files: FileItem[]
  onClose: () => void
}

export function FilesSidebar({ open, files, onClose }: FilesSidebarProps) {
  return (
    <div className={`files-sidebar ${open ? 'open' : ''}`}>
      <div className="files-sidebar-header">
        <h3>
          <File size={16} /> Files
        </h3>
        <button className="files-sidebar-close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="files-sidebar-body">
        {files.length === 0 ? (
          <div className="empty-state">No files generated yet</div>
        ) : (
          files.map((file, i) => (
            <div key={i} className="file-card">
              <div className="file-card-header">
                <span className="file-icon">📄</span>
                <div className="file-info">
                  <div className="file-name">{file.name}</div>
                  <div className="file-meta">{file.path}</div>
                </div>
                <div className="file-actions">
                  <button className="file-action-btn download" title="Download">
                    <Download size={10} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// Configurar el worker oficial de PDF.js para que pueda procesar en segundo plano
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

function App() {
  // Cargar sesión de la caché
  const [usuarioGuardado, setUsuarioGuardado] = useState(() => {
    const cachedUser = localStorage.getItem('usuario_imperio')
    return cachedUser ? JSON.parse(cachedUser) : null
  })

  // Estados comunes
  const [nombre, setNombre] = useState('')
  const [pin, setPin] = useState('')
  const [mensaje, setMensaje] = useState('Esperando acción...')
  const [error, setError] = useState(false)
  const [modo, setModo] = useState('imprimir') 
  const [escaneando, setEscaneando] = useState(false)
  const [pdfResultado, setPdfResultado] = useState(null)

  // ==========================================
  // ESTADOS DE IMPRESIÓN ACTUALIZADOS 🖨️
  // ==========================================
  const [archivoPDF, setArchivoPDF] = useState(null)
  const [imprimiendo, setImprimiendo] = useState(false)
  const [modoColor, setModoColor] = useState('monochrome') 
  const [copias, setCopias] = useState(1)
  const [tipoRango, setTipoRango] = useState('todas') 
  const [rangoPaginas, setRangoPaginas] = useState('') 
  const [totalPaginas, setTotalPaginas] = useState(0)

  const esAndroid = () => /Android/i.test(navigator.userAgent)

  // NUEVA FUNCIÓN MAESTRA CON PDF.JS (Soporta PDFs de miles de páginas comprimidos)
  // NUEVA FUNCIÓN RESISTENTE DE ALTO RENDIMIENTO (Sin dependencias externas)
  const contarPaginasPDF = (file) => {
    setMensaje('Analizando estructura interna del PDF... ⏳')
    const reader = new FileReader()
    
    reader.onload = function () {
      try {
        const arr = new Uint8Array(reader.result)
        const decoder = new TextDecoder('latin1') // Usamos latin1 para no perder bytes binarios
        const str = decoder.decode(arr)
        
        let conteoMaximo = 1
        
        const coincidenciasTipoPages = str.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s*(\d+)/g)
        if (coincidenciasTipoPages) {
          coincidenciasTipoPages.forEach(match => {
            const num = parseInt(match.match(/\/Count\s*(\d+)/)[1], 10)
            if (num > conteoMaximo) conteoMaximo = num
          })
        }
        
        const coincidenciasCountGenericas = str.match(/\/Count\s*(\d+)/g)
        if (coincidenciasCountGenericas) {
          coincidenciasCountGenericas.forEach(match => {
            const num = parseInt(match.match(/\d+/)[0], 10)
            if (num > conteoMaximo && num < 5000) { // Límite de seguridad razonable
              conteoMaximo = num
            }
          })
        }
        
        setTotalPaginas(conteoMaximo)
        setMensaje(`¡Archivo analizado con éxito! Detectadas: ${conteoMaximo} páginas.`)
      } catch (err) {
        console.error(err)
        setError(true)
        setMensaje('⚠️ Error estructural al leer el documento. Forzando modo de 1 página.')
        setTotalPaginas(1)
      }
    }
    
    reader.readAsArrayBuffer(file)
  }

  const manejarCambioArchivo = (e) => {
    setError(false)
    const file = e.target.files[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      setError(true)
      setMensaje('❌ Error: Solo se permiten archivos en formato PDF.')
      setArchivoPDF(null)
      setTotalPaginas(0)
      return
    }

    setArchivoPDF(file)
    contarPaginasPDF(file)
  }

  // VALIDACIÓN DE RANGOS ANTES DE ENVIAR
  const validarRangoExcede = () => {
    if (tipoRango === 'todas' || totalPaginas <= 1) return false
    if (!rangoPaginas) return false

    // Extraer todos los números que el usuario haya escrito (ya sea con guiones o comas)
    const numeros = rangoPaginas.match(/\d+/g)
    if (!numeros) return false

    // Si algún número es mayor al total de páginas, hay error
    const excede = numeros.some(num => parseInt(num, 10) > totalPaginas)
    return excede
  }

  const ejecutarImpresion = async (e) => {
    e.preventDefault()
    if (!archivoPDF) return

    if (validarRangoExcede()) {
      setError(true)
      setMensaje(`❌ Error: El rango escrito excede las ${totalPaginas} páginas del documento.`)
      return
    }

    setImprimiendo(true)
    setError(false)
    setMensaje('Subiendo PDF y enviando orden a la Pi... ⏳')

    const payload = new FormData()
    payload.append('file', archivoPDF)
    payload.append('nombre', usuarioGuardado.nombre)
    payload.append('pin', usuarioGuardado.pin)
    payload.append('modo_color', modoColor)
    payload.append('copias', copias)
    payload.append('rango', totalPaginas <= 1 || tipoRango === 'todas' ? 'all' : rangoPaginas)

    try {
      const respuesta = await fetch('http://192.168.0.6:5000/printer', {
        method: 'POST',
        body: payload,
      })

      const datos = await respuesta.json()
      if (!respuesta.ok) throw new Error(datos.detail || 'Error en el servidor')

      setMensaje(`🖨️ Backend responde: ${datos.message}`)
      setArchivoPDF(null)
      setTotalPaginas(0)
      setRangoPaginas('')
      setTipoRango('todas')
    } catch (err) {
      setError(true)
      setMensaje(err.message)
    } finally {
      setImprimiendo(false)
    }
  }

  // (Login, escaneo y logout se mantienen idénticos...)
  const manejarEnvio = async (e) => {
    e.preventDefault(); setError(false); setMensaje('Conectando... ⏳')
    try {
      const r = await fetch('http://192.168.0.6:5000/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre, pin }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || 'Error')
      const s = { nombre, pin, total_escaneos: d.total_escaneos_actual || 0 }
      localStorage.setItem('usuario_imperio', JSON.stringify(s)); setUsuarioGuardado(s); setMensaje('Sesión lista.')
    } catch (err) { setError(true); setMensaje(err.message) }
  }

  const ejecutarEscaneo = async () => {
    setEscaneando(true); setMensaje('Escaneando... ⏳'); setPdfResultado(null)
    try {
      const r = await fetch('http://192.168.0.6:5000/scaner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: usuarioGuardado.nombre, pin: usuarioGuardado.pin }) })
      if (!r.ok) throw new Error('Error al escanear')
      const b = await r.blob(); setPdfResultado(URL.createObjectURL(b)); setMensaje('Escaneo completado.')
    } catch (err) { setMensaje(err.message) } finally { setEscaneando(false) }
  }

  const cerrarSesion = () => { localStorage.removeItem('usuario_imperio'); setUsuarioGuardado(null); setPdfResultado(null); setMensaje('Sesión cerrada.') }

  if (usuarioGuardado) {
    return (
      <div className="container-global">
        <div className="card-dashboard">
          <h1 className="titulo-app">🖨️ Portal del Imperio</h1>
          <p className="Bienvenida">Usuario: <strong>{usuarioGuardado.nombre}</strong></p>
          
          <div className="selector-modo" style={{ margin: '20px 0', display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={() => { setModo('imprimir'); setMensaje('Modo Impresión seleccionado.'); }} className={`btn-modo ${modo === 'imprimir' ? 'activo' : ''}`} style={{ padding: '10px 20px', fontWeight: 'bold', cursor: 'pointer', border: modo === 'imprimir' ? '2px solid #3182ce' : '1px solid #ccc', backgroundColor: modo === 'imprimir' ? '#ebf8ff' : '#fff' }}>Modo Imprimir</button>
            <button onClick={() => { setModo('escanear'); setMensaje('Modo Escaneo seleccionado.'); }} className={`btn-modo ${modo === 'escanear' ? 'activo' : ''}`} style={{ padding: '10px 20px', fontWeight: 'bold', cursor: 'pointer', border: modo === 'escanear' ? '2px solid #48bb78' : '1px solid #ccc', backgroundColor: modo === 'escanear' ? '#f0fff4' : '#fff' }}>Modo Escanear</button>
          </div>

          <p style={{ color: error ? '#e53e3e' : '#4a5568', fontSize: '14px', fontStyle: 'italic', margin: '15px 0', fontWeight: error ? 'bold' : 'normal' }}>{mensaje}</p>

          <div className="zona-trabajo" style={{ minHeight: '200px', border: '2px solid #cbd5e0', borderRadius: '8px', padding: '20px', marginBottom: '20px', textAlign: 'left' }}>
            
            {/* MÓDULO DE IMPRESIÓN */}
            {modo === 'imprimir' && (
              <div className="seccion-impresion">
                <h3 style={{ textAlign: 'center' }}>🖨️ Módulo de Impresión</h3>
                
                <form onSubmit={ejecutarImpresion}>
                  <div style={{ border: '2px dashed #3182ce', padding: '25px', borderRadius: '6px', textAlign: 'center', backgroundColor: '#f7fafc', position: 'relative', marginBottom: '20px' }}>
                    <input type="file" accept=".pdf" onChange={manejarCambioArchivo} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                    <p style={{ margin: 0, fontWeight: 'bold' }}>
                      {archivoPDF ? `📄 ${archivoPDF.name}` : 'Selecciona tu archivo PDF aquí 📄'}
                    </p>
                    {totalPaginas > 0 && (
                      <span style={{ fontSize: '14px', color: '#2b6cb0', display: 'block', marginTop: '6px', fontWeight: 'bold' }}>
                        📊 Total páginas reales detectadas: {totalPaginas}
                      </span>
                    )}
                  </div>

                  {archivoPDF && totalPaginas > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Modo de Tinta:</label>
                        <select value={modoColor} onChange={(e) => setModoColor(e.target.value)} style={{ padding: '8px', width: '100%', borderRadius: '4px' }}>
                          <option value="monochrome">Blanco y Negro</option>
                          <option value="color">Color Total</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Número de Copias:</label>
                        <input type="number" min="1" max="50" value={copias} onChange={(e) => setCopias(parseInt(e.target.value) || 1)} style={{ padding: '8px', width: '95%', borderRadius: '4px' }} />
                      </div>

                      {/* CONDICIONAL REAL: Si tiene más de 1 página, desborda las opciones de rango */}
                      {totalPaginas > 1 ? (
                        <div style={{ backgroundColor: '#edf2f7', padding: '12px', borderRadius: '6px' }}>
                          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Páginas a Imprimir:</label>
                          <div style={{ display: 'flex', gap: '20px', marginBottom: '10px' }}>
                            <label style={{ cursor: 'pointer' }}>
                              <input type="radio" name="rango_sel" checked={tipoRango === 'todas'} onChange={() => setTipoRango('todas')} /> TODAS LAS PÁGINAS
                            </label>
                            <label style={{ cursor: 'pointer' }}>
                              <input type="radio" name="rango_sel" checked={tipoRango === 'personalizado'} onChange={() => setTipoRango('personalizado')} /> SELECCIONAR RANGO
                            </label>
                          </div>
                          
                          {tipoRango === 'personalizado' && (
                            <div>
                              <input 
                                type="text" 
                                placeholder={`Ej: 1-${totalPaginas} o salteadas: 1,5,28`} 
                                value={rangoPaginas} 
                                onChange={(e) => setRangoPaginas(e.target.value)} 
                                style={{ padding: '8px', width: '95%', borderRadius: '4px', border: validarRangoExcede() ? '2px solid #e53e3e' : '1px solid #ccc' }} 
                                required 
                              />
                              <small style={{ display: 'block', marginTop: '4px', color: '#718096' }}>
                                Formatos válidos: Continuo (Ej: 1-10) o Salteado separado por comas (Ej: 1,5,28). Máximo permitido: {totalPaginas}
                              </small>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p style={{ color: '#4a5568', fontSize: '13px', backgroundColor: '#ebf8ff', padding: '8px', borderRadius: '4px' }}>
                          💡 Documento de una sola página. Se enviará completo de forma automática.
                        </p>
                      )}

                      <button 
                        type="submit" 
                        disabled={imprimiendo || validarRangoExcede()} 
                        style={{ 
                          backgroundColor: validarRangoExcede() ? '#cbd5e0' : '#3182ce', 
                          color: 'white', border: 'none', padding: '14px', fontSize: '16px', fontWeight: 'bold', borderRadius: '6px', 
                          cursor: validarRangoExcede() ? 'not-allowed' : 'pointer', width: '100%', marginTop: '10px' 
                        }}
                      >
                        {imprimiendo ? 'Procesando en la Pi... 🔄' : 'Mandar a Imprimir Documento Real ⚡'}
                      </button>
                    </div>
                  )}
                </form>
              </div>
            )}

            {/* MODO ESCANEAR */}
            {modo === 'escanear' && (
              <div className="seccion-escaneo" style={{ textAlign: 'center' }}>
                <h3>🔍 Módulo de Escaneo Real</h3>
                <button onClick={ejecutarEscaneo} disabled={escaneando} className="btn-escanear" style={{ backgroundColor: '#48bb78', color: 'white', border: 'none', padding: '12px 30px', fontSize: '16px', fontWeight: 'bold', borderRadius: '6px' }}>
                  {escaneando ? 'Escaneando... 🔄' : 'Lanzar Escáner Real ⚡'}
                </button>
                <div className="recuadro-visor-pdf" style={{ marginTop: '25px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#f7fafc', padding: '10px' }}>
                  <h4>📄 Documento Escaneado Resultante</h4>
                  {pdfResultado ? (
                    esAndroid() ? (
                      <div style={{ padding: '20px 10px' }}>
                        <a href={pdfResultado} download={`escaneo_${usuarioGuardado.nombre}.pdf`} style={{ display: 'inline-block', backgroundColor: '#3182ce', color: 'white', textDecoration: 'none', padding: '14px 24px', borderRadius: '8px', fontWeight: 'bold' }}>Descargar PDF en Celular 📥</a>
                      </div>
                    ) : (
                      <iframe src={pdfResultado} title="Visor" width="100%" height="450px" style={{ border: 'none', borderRadius: '4px' }} />
                    )
                  ) : (
                    <p style={{ color: '#a0aec0', padding: '40px 0' }}>Aquí aparecerá tu documento en cuanto termine la digitalización.</p>
                  )}
                </div>
              </div>
            )}

          </div>

          <button onClick={cerrarSesion} className="btn-cerrar-sesion" style={{ backgroundColor: '#e53e3e', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Cerrar Sesión 🚪</button>
        </div>
      </div>
    )
  }

  return (
    <div className="container-global">
      <div className="card-login">
        <h1 className="titulo-app">🖨️ Portal de Impresión</h1>
        <form onSubmit={manejarEnvio} className="formulario">
          <div className="grupo-input"><label className="label-input">Nombre:</label><input type="text" className="input-texto" value={nombre} onChange={(e) => setNombre(e.target.value)} required /></div>
          <div className="grupo-input"><label className="label-input">PIN:</label><input type="password" className="input-texto" maxLength="4" value={pin} onChange={(e) => setPin(e.target.value)} required /></div>
          <button type="submit" className="btn-enviar">Validar e Ingresar ⚡</button>
        </form>
        <div className={`caja-estado ${error ? 'estado-error' : 'estado-ok'}`}>{mensaje}</div>
      </div>
    </div>
  )
}

export default App
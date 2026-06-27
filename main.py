from fastapi import FastAPI, Depends, HTTPException, File, Form, UploadFile
from fastapi.responses import FileResponse # <-- Crucial para enviar el archivo PDF
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import subprocess
import os
from PIL import Image
import shutil # Utilidad para copiar flujos de archivos fácilmente
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# ==========================================
# 1. CONFIGURACIÓN DE POSTGRESQL (Tu Base de Datos)
# ==========================================
# Modifica esta línea en tu main.py para que use la IP real de tu Pi
# Al estar la API en network_mode host, ve los puertos mapeados de la Pi en localhost
# Cambiamos el driver a psycopg (Psycopg 3) para que calce con la nueva librería
DATABASE_URL = "postgresql+pg8000://postgres:123@127.0.0.1:5432/bd_impresion"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Modelo de la tabla 'usuarios'
class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, nullable=False)
    pin = Column(String, unique=True, nullable=False)
    total_impresiones = Column(Integer, default=0)
    total_escaneos = Column(Integer, default=0)

# Dependencia para abrir/cerrar la sesión de la BD en cada petición
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ==========================================
# 2. CONFIGURACIÓN DE FASTAPI Y CORS
# ==========================================
app = FastAPI(title="Backend del Imperio con Base de Datos")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Esquema para validar el JSON que manda React
class RequestData(BaseModel):
    nombre: str
    pin: str

# ==========================================
# 3. ENDPOINT CON SELECT REAL
# ==========================================
@app.post("/login")
def login_real(data: RequestData, db: Session = Depends(get_db)):
    # Validamos que el PIN tenga un formato inicial correcto (4 dígitos numéricos)
    if not data.pin.isdigit() or len(data.pin) != 4:
        raise HTTPException(status_code=400, detail="El PIN debe ser de 4 dígitos numéricos.")

    # EL SELECT: Buscamos al usuario en Postgres que coincida en Nombre Y PIN
    usuario = db.query(Usuario).filter(
        Usuario.nombre == data.nombre, 
        Usuario.pin == data.pin
    ).first()

    # Si el SELECT no devuelve nada, significa que no existe o el PIN está mal
    if not usuario:
        raise HTTPException(
            status_code=401, 
            detail="Nombre de usuario o PIN incorrectos. Acceso denegado."
        )

    # Si todo coincide, devolvemos el éxito y sus estadísticas reales de la BD
    return {
        "status": "success",
        "message": f"¡Autenticación exitosa! Bienvenido {usuario.nombre}.",
        "total_impresiones_actual": usuario.total_impresiones
    }
CARPETA_ESCANEOS = "./escaneos_locales"
os.makedirs(CARPETA_ESCANEOS, exist_ok=True)

@app.post("/scaner")
def ejecutar_escaneo_real(data: RequestData, db: Session = Depends(get_db)):
    # 1. VALIDACIÓN DE SEGURIDAD EN POSTGRES
    usuario = db.query(Usuario).filter(
        Usuario.nombre == data.nombre, 
        Usuario.pin == data.pin
    ).first()

    if not usuario:
        raise HTTPException(status_code=401, detail="Usuario o PIN inválidos. No puedes usar el hardware.")

    # 2. DEFINIR RUTAS DE ARCHIVOS TEMPORALES Y FINALES
    archivo_imagen = os.path.join(CARPETA_ESCANEOS, f"temp_{usuario.nombre}.png")
    archivo_pdf = os.path.join(CARPETA_ESCANEOS, f"escaneo_{usuario.nombre}.pdf")

    try:
        # 3. MANDAR LA ORDEN AL HARDWARE FÍSICO A TRAVÉS DE SANE
        # --format=png captura la imagen directamente de la bandeja
        # --resolution 150 es ideal: rápido y se ve excelente
        print(f" Lanzando escáner para {usuario.nombre}...")
        subprocess.run(
            ["scanimage", "--format=png", "--output-file", archivo_imagen, "--resolution", "150", "--mode", "Color",],
            check=True,
            capture_output=True,
            text=True
        )

        # 4. CONVERTIR LA IMAGEN RESULTANTE A UN PDF PROFESIONAL
        if os.path.exists(archivo_imagen):
            img = Image.open(archivo_imagen)
            img_converted = img.convert('RGB') # Convertir a canales listos para PDF
            img_converted.save(archivo_pdf, "PDF", resolution=150.0)
            
            # Limpiamos la imagen temporal para no devorarnos el almacenamiento de la Pi
            os.remove(archivo_imagen)
        else:
            raise HTTPException(status_code=500, detail="El hardware no generó el archivo de imagen.")

        # 5. ACTUALIZAR LAS ESTADÍSTICAS DEL IMPERIO EN POSTGRES
        usuario.total_escaneos += 1
        db.commit()
        db.refresh(usuario)

        # 6. ENVIAR EL ARCHIVO PDF REAL AL NAVEGADOR
        return FileResponse(
            path=archivo_pdf, 
            media_type="application/pdf", 
            filename=f"escaneo_{usuario.nombre}.pdf"
        )

    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=503, detail=f"Fallo físico en la Canon: {e.stderr or 'Apagada o desconectada.'}")
    except Exception as e:
        # ¡ESTO NOS VA A DECIR LA VERDAD! 🕵️‍♂️
        print(f"❌ ERROR CRÍTICO DETECTADO: {str(e)}") 
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

CARPETA_IMPRESION = "./archivos_recibidos"
os.makedirs(CARPETA_IMPRESION, exist_ok=True) 
@app.post("/printer")
def printear(
    file: UploadFile = File(...),              
    nombre: str = Form(...),                  
    pin: str = Form(...),
    modo_color: str = Form(...),
    copias: int = Form(...),
    rango: str = Form(...), 
    db: Session = Depends(get_db)
):
    # 1. Validación de seguridad contra la Base de Datos
    usuario = db.query(Usuario).filter(Usuario.nombre == nombre, Usuario.pin == pin).first()
    if not usuario:
        raise HTTPException(status_code=401, detail="Usuario o PIN incorrectos. Acceso denegado.")

    # 2. Validación extra de formato
    if not file.filename.endswith('.pdf') and file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Formato no aceptado. Solo archivos .pdf")

    # 3. Guardar el archivo físicamente en la Pi
    ruta_guardado = os.path.join(CARPETA_IMPRESION, f"print_{usuario.nombre}_{file.filename}")
    with open(ruta_guardado, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 4. CONSTRUIR EL COMANDO DE IMPRESIÓN FÍSICA (`lp`) 🖨️💥
    # Iniciamos con el comando base y el número de copias
    comando_lp = ["lp", "-n", str(copias)]

    # Determinar Modo de Color/Tinta para la Canon
    # Nota: CUPS suele manejar 'color' o 'monochrome' / 'grayscale' según el driver.
    if modo_color == "color":
        comando_lp.extend(["-o", "ColorModel=RGB"])
    else:
        comando_lp.extend(["-o", "ColorModel=Gray"])

    # Determinar Rango de Páginas si no es "all"
    if rango != "all" and rango.strip() != "":
        # lp usa el parámetro -P para los rangos (acepta "1-5" o "1,5,28")
        comando_lp.extend(["-P", rango.strip()])

    # Finalmente, le pasamos la ruta del PDF que acabamos de guardar
    comando_lp.append(ruta_guardado)

    # 5. LANZAR EL PROCESO AL HARDWARE
    try:
        print(f"\n🚀 Mandando orden física a la Canon para {usuario.nombre}...")
        print(f"💻 Ejecutando: {' '.join(comando_lp)}")
        
        # Ejecutamos el comando en el sistema operativo
        resultado = subprocess.run(comando_lp, check=True, capture_output=True, text=True)
        
        print("✅ Impresión enviada a la cola de CUPS con éxito.")
        print(f"📋 Salida de CUPS: {resultado.stdout.strip()}\n")

        # Opcional: Aquí podrías sumarle impresiones al usuario en la BD si llevas conteo
        # usuario.total_impresiones += copias (o las páginas reales)
        # db.commit()

        return {
            "status": "success",
            "message": f"Documento enviado a la Canon. {copias} copia(s) procesada(s) correctamente."
        }

    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR FÍSICO EN CUPS: {e.stderr}")
        raise HTTPException(
            status_code=503, 
            detail=f"Error en el sistema de impresión de la Pi: {e.stderr or 'Impresora desconectada o CUPS apagado.'}"
        )
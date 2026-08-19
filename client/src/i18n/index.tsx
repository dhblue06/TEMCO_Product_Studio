// 手机端双语（中文 / Español）轻量 i18n
import React, { createContext, useContext, useEffect, useState } from 'react';

export type Lang = 'zh' | 'es';

type Entry = { zh: string; es: string };

// ===== 字典 =====
const DICT: Record<string, Entry> = {
  // 通用
  'app.title': { zh: 'TEMCO', es: 'TEMCO' },
  'common.save': { zh: '保存', es: 'Guardar' },
  'common.cancel': { zh: '取消', es: 'Cancelar' },
  'common.close': { zh: '关闭', es: 'Cerrar' },
  'common.search': { zh: '搜索', es: 'Buscar' },
  'common.loading': { zh: '加载中...', es: 'Cargando...' },
  'common.confirm': { zh: '确定', es: 'Confirmar' },
  'common.back': { zh: '返回', es: 'Volver' },
  'common.continue': { zh: '继续', es: 'Continuar' },

  // 手机端入口（hub）
  'hub.subtitle': { zh: '选择你的工作入口', es: 'Elige tu tarea' },
  'hub.hint': { zh: '各入口共用同一账号 · 选择后进入对应工作台', es: 'Misma cuenta para todos · Elige y empieza' },
  'hub.backHome': { zh: '入口', es: 'Menú' },
  'hub.capture': { zh: '商品采集', es: 'Captura' },
  'hub.captureDesc': { zh: '扫码找货、拍照、颜色/库存/型号登记', es: 'Escanear, fotos, colores/stock/modelos' },
  'hub.stock': { zh: '缺货上报', es: 'Faltantes' },
  'hub.stockDesc': { zh: '扫码报"剩X件/剩X箱/已卖完"，同步网站', es: 'Reportar unidades/cajas/agotado, sincronizar web' },
  'hub.inventory': { zh: '仓库盘点', es: 'Inventario' },
  'hub.inventoryDesc': { zh: '批次盘点：型号×颜色×数量', es: 'Recuento por lotes: modelo×color×cantidad' },

  // 缺货上报（手机端）
  'stock.title': { zh: '缺货上报', es: 'Faltantes' },
  'stock.scan': { zh: '📷 扫码', es: '📷 Escanear' },
  'stock.manual': { zh: '⌨️ 输条码', es: '⌨️ Código' },
  'stock.startScan': { zh: '▶ 开始扫码', es: '▶ Iniciar escáner' },
  'stock.stopScan': { zh: '⏹ 停止扫码', es: '⏹ Detener escáner' },
  'stock.photoScan': { zh: '📷 拍照扫码', es: '📷 Foto escáner' },
  'stock.noCameraHint': { zh: '此网络环境不支持实时摄像头，可用"拍照扫码"或手动输入', es: 'Cámara en vivo no disponible; use foto o código manual' },
  'stock.queryPh': { zh: '输入条码 / 编号 / 名称', es: 'Código / Ref / Nombre' },
  'stock.query': { zh: '查询', es: 'Buscar' },
  'stock.notFound': { zh: '未找到该产品，请检查条码或编号', es: 'Producto no encontrado' },
  'stock.queryFail': { zh: '查询失败', es: 'Error de búsqueda' },
  'stock.type': { zh: '缺货类型', es: 'Tipo de falta' },
  'stock.typePieces': { zh: '剩余件数', es: 'Unidades' },
  'stock.typeBoxes': { zh: '剩余箱数', es: 'Cajas' },
  'stock.typeSoldOut': { zh: '已卖完', es: 'Agotado' },
  'stock.qtyPieces': { zh: '剩余件数', es: 'Unidades restantes' },
  'stock.qtyBoxes': { zh: '剩余箱数', es: 'Cajas restantes' },
  'stock.qtyPhPieces': { zh: '例如 5 件', es: 'Ej.: 5' },
  'stock.qtyPhBoxes': { zh: '例如 3 箱', es: 'Ej.: 3' },
  'stock.boxSize': { zh: '每箱件数', es: 'Unid. por caja' },
  'stock.soldOutWarn': { zh: '⚠️ 标记为已卖完（同步后网站库存将为 0）', es: '⚠️ Agotado: stock web quedará en 0' },
  'stock.notePh': { zh: '备注（可选）', es: 'Nota (opcional)' },
  'stock.submit': { zh: '提交缺货上报', es: 'Enviar reporte' },
  'stock.submitSoldOut': { zh: '🚫 标记已卖完', es: '🚫 Marcar agotado' },
  'stock.submitting': { zh: '提交中...', es: 'Enviando...' },
  'stock.done': { zh: '缺货已记录，网站红标已更新', es: 'Registrado. Aviso web actualizado' },
  'stock.submitFail': { zh: '提交失败', es: 'Error al enviar' },
  'stock.hint': { zh: '📷 扫描或输入条码后，选择缺货类型提交', es: 'Escanee o escriba el código y elija el tipo de falta' },
  'stock.websiteQty': { zh: '网站当前库存', es: 'Stock web actual' },
  'stock.photo': { zh: '📷 拍照上传（可选）', es: '📷 Foto (opcional)' },
  'stock.photoTake': { zh: '拍照', es: 'Foto' },
  'stock.photoAlbum': { zh: '相册', es: 'Galería' },
  'stock.photoHint': { zh: '可为产品拍照留证（不强制，可跳过直接提交）', es: 'Foto opcional del producto (puede omitirse)' },
  'stock.photoUploading': { zh: '上传照片中...', es: 'Subiendo foto...' },
  'stock.photoFail': { zh: '照片上传失败', es: 'Error al subir foto' },

  // 登录 / 会话
  'login.title': { zh: '开始采集', es: 'Iniciar captura' },
  'login.operator': { zh: '操作员姓名', es: 'Nombre del operario' },
  'login.operatorPh': { zh: '如：Ana', es: 'Ej.: Ana' },
  'login.device': { zh: '设备名称', es: 'Nombre del dispositivo' },
  'login.devicePh': { zh: '如：Ana 的手机', es: 'Ej.: Móvil de Ana' },
  'login.pin': { zh: '访问 PIN（如电脑端已设置）', es: 'PIN (si está configurado)' },
  'login.pinPh': { zh: '电脑端"设置 → 手机采集"中查看', es: 'Ver en Configuración → Captura móvil' },
  'login.area': { zh: '区域/备注（可选）', es: 'Zona / nota (opcional)' },
  'login.btn': { zh: '开始采集', es: 'Comenzar' },
  'session.new': { zh: '＋ 创建新会话', es: '＋ Nueva sesión' },
  'session.collapse': { zh: '收起表单', es: 'Ocultar formulario' },
  'session.code': { zh: '会话', es: 'Sesión' },
  'session.name': { zh: '会话名称（区域/备注，可选）', es: 'Nombre de sesión (zona, opcional)' },
  'session.active': { zh: '进行中', es: 'Activa' },
  'session.completed': { zh: '已完成', es: 'Completada' },
  'session.cancelled': { zh: '已取消', es: 'Cancelada' },

  // 导航
  'tab.scan': { zh: '📷 扫码', es: '📷 Escanear' },
  'tab.search': { zh: '🔍 搜索', es: '🔍 Buscar' },
  'tab.clear': { zh: '↩ 清除', es: '↩ Limpiar' },
  'back.toResults': { zh: '← 返回搜索结果', es: '← Volver a resultados' },

  // 搜索
  'search.ph': { zh: '输入型号 / Reference / 序列号 / EAN / 名称...', es: 'Modelo / Ref / Serie / EAN / Nombre...' },
  'search.results': { zh: '个候选，请选择：', es: ' candidatos, elija:' },
  'search.active.hint': { zh: '🟢 网站已启用 · 🔴 网站未启用 · ⚪ 未同步', es: '🟢 Activo · 🔴 Inactivo · ⚪ No sincronizado' },
  'search.confidence': { zh: '置信度', es: 'confianza' },
  'search.notFound': { zh: '未找到匹配产品', es: 'Producto no encontrado' },
  'search.addNew': { zh: '➕ 未找到，新增产品', es: '➕ No encontrado, añadir producto' },

  // 产品摘要
  'product.websiteData': { zh: '🌐 网站实时数据', es: '🌐 Datos web en tiempo real' },
  'product.images': { zh: '图片', es: 'imágenes' },
  'product.stock': { zh: '库存', es: 'stock' },
  'product.variants': { zh: '变体', es: 'variantes' },
  'product.noVariants': { zh: '该产品网站无变体', es: 'Sin variantes en web' },
  'product.soldOut': { zh: '🚫 已卖完', es: '🚫 Agotado' },
  'product.markSoldOut': { zh: '🚫 标记已卖完', es: '🚫 Marcar agotado' },
  'product.unmarkSoldOut': { zh: '✅ 取消已卖完', es: '✅ Quitar agotado' },
  'product.refresh': { zh: '刷新状态', es: 'Refrescar' },
  'product.lastCapture': { zh: '上次采集', es: 'Última captura' },
  'product.websiteImages': { zh: '网站图片', es: 'Imágenes web' },

  // 采集界面
  'capture.takePhoto': { zh: '📷 拍照', es: '📷 Foto' },
  'capture.album': { zh: '🖼 相册', es: '🖼 Galería' },
  'capture.colors': { zh: '🎨 产品颜色', es: '🎨 Colores' },
  'capture.inventory': { zh: '📦 库存', es: '📦 Inventario' },
  'capture.phoneModels': { zh: '📱 手机型号（点货统计）', es: '📱 Modelos móviles' },
  'capture.phoneModelsHint': { zh: '勾选适用该手机壳的手机型号，仅用于点货统计，不会同步到网站', es: 'Marque modelos compatibles. Solo estadística, no se sincroniza.' },
  'capture.notes': { zh: '📝 备注', es: '📝 Notas' },
  'capture.notesPh': { zh: '备注（可选）', es: 'Notas (opcional)' },
  'capture.voice': { zh: '🎤 语音备注（可留空）', es: '🎤 Nota de voz (opcional)' },
  'capture.saveDraft': { zh: '保存草稿', es: 'Guardar borrador' },
  'capture.submit': { zh: '提交任务', es: 'Enviar tarea' },
  'capture.saveAndNext': { zh: '保存并处理下一个', es: 'Guardar y siguiente' },
  'capture.loadingModels': { zh: '正在加载手机型号...', es: 'Cargando modelos...' },
  'capture.fixedColors': { zh: '🎨 固定颜色', es: '🎨 Colores fijos' },
  'capture.fixedColorsHint': { zh: '点型号自动勾选；某型号缺色可手动点掉', es: 'Se marcan al elegir modelo; desmarque si falta' },
  'capture.fixedColorsEdit': { zh: '✏️ 设置', es: '✏️ Editar' },
  'capture.fixedColorsSave': { zh: '保存固定颜色', es: 'Guardar colores fijos' },
  'capture.fixedColorsEmpty': { zh: '未设置（点型号只勾选型号，颜色手动选）', es: 'Sin definir (solo modelo)' },
  'alert.saveFixedFail': { zh: '保存固定颜色失败', es: 'Error al guardar colores fijos' },
  'capture.expandAll': { zh: '展开全部', es: 'Ver todos' },
  'capture.collapse': { zh: '收起', es: 'Ocultar' },

  // 新增产品弹窗
  'new.title': { zh: '➕ 新增产品', es: '➕ Nuevo producto' },
  'new.hint': { zh: '本地库中未找到该产品，填写信息后创建采集任务。', es: 'Producto no encontrado. Rellene y cree la tarea.' },
  'new.name': { zh: '产品名称 *', es: 'Nombre *' },
  'new.namePh': { zh: '如：时尚女士手表', es: 'Ej.: Reloj de mujer' },
  'new.serial': { zh: '序列号', es: 'Nº serie' },
  'new.ean': { zh: '条形码（扫码自动填入）', es: 'Código de barras (auto)' },
  'new.reference': { zh: 'Reference（留空自动生成）', es: 'Referencia (auto si vacío)' },
  'new.price': { zh: '价格 €（选填）', es: 'Precio € (opcional)' },
  'new.colors': { zh: '变体颜色（选填，与网站变体一致）', es: 'Colores (opcional, como web)' },
  'new.create': { zh: '创建产品并开始采集', es: 'Crear y capturar' },

  // 盘点
  'inv.title': { zh: '📦 快速盘点', es: '📦 Inventario rápido' },
  'inv.hint': { zh: '快速盘点：型号 × 颜色 × 数量，按批次保存', es: 'Modelo × Color × Cantidad por lote' },
  'inv.current': { zh: '当前盘点', es: 'Inventario actual' },
  'inv.none': { zh: '暂无进行中的盘点', es: 'No hay inventario activo' },
  'inv.resume': { zh: '[继续盘点]', es: '[Continuar]' },
  'inv.new': { zh: '＋ 新建盘点', es: '＋ Nuevo lote' },
  'inv.newPh': { zh: '盘点名称（如：手机壳 A 区）', es: 'Nombre (ej.: Zona A fundas)' },
  'inv.start': { zh: '开始盘点', es: 'Comenzar' },
  'inv.pickProduct': { zh: '选择要盘点的产品款式', es: 'Elija el producto' },
  'inv.selectBrand': { zh: '选择品牌：', es: 'Elija marca:' },
  'inv.counted': { zh: '已盘', es: 'contados' },
  'inv.prev': { zh: '← 上一个', es: '← Anterior' },
  'inv.skip': { zh: '跳过', es: 'Saltar' },
  'inv.saveNext': { zh: '保存并下一个 →', es: 'Guardar y sig. →' },
  'inv.done': { zh: '✓ 完成', es: '✓ Terminar' },
  'inv.saving': { zh: '…保存中', es: 'Guardando…' },
  'inv.inherit': { zh: '☑ 自动使用上一型号颜色', es: '☑ Heredar colores del modelo anterior' },
  'inv.addColor': { zh: '＋ 添加颜色', es: '＋ Añadir color' },
  'inv.pickColor': { zh: '选择颜色…', es: 'Elija color…' },
  'inv.qty': { zh: '数量', es: 'Cantidad' },
  'inv.exact': { zh: '精确', es: 'Exacto' },
  'inv.estimated': { zh: '大约', es: 'Aprox.' },
  'inv.zeroHint': { zh: '输入 0 = 无货', es: '0 = agotado' },
  'inv.summary': { zh: '📊 盘点汇总', es: '📊 Resumen' },
  'inv.summaryDone': { zh: '✓ 完成盘点', es: '✓ Finalizar' },
  'inv.totalQty': { zh: '总数量', es: 'Total' },
  'inv.outOfStock': { zh: '🔴 无货', es: '🔴 Agotado' },
  'inv.lowStock': { zh: '🟠 少量', es: '🟠 Poco' },
  'inv.colorRecords': { zh: '颜色记录', es: 'Colores' },
  'inv.models': { zh: '型号', es: 'Modelos' },
  'inv.continueCount': { zh: '← 继续盘点', es: '← Continuar' },
  'inv.diffLarge': { zh: '⚠ 与网站差异较大', es: '⚠ Diferencia grande vs web' },

  // 扫码
  'scan.stop': { zh: '⏹ 停止扫码', es: '⏹ Detener' },
  'scan.live': { zh: '📷 实时扫码', es: '📷 Escaneo en vivo' },
  'scan.unsupported': { zh: '⚠️ 当前环境不支持实时摄像头（需 HTTPS/localhost）', es: '⚠️ Cámara no disponible (requiere HTTPS/localhost)' },
  'scan.photo': { zh: '📸 拍照扫码', es: '📸 Escanear con foto' },
  'scan.recognizing': { zh: '识别中…', es: 'Reconociendo…' },
  'scan.notFound': { zh: '未识别到条码。请对准条码、光线充足时重新拍摄，或使用搜索/手动输入', es: 'Código no reconocido. Enfoque bien y repita, o use Buscar / entrada manual.' },
  'scan.hint': { zh: '拍照扫码：对准产品条码拍照，自动识别 EAN / Code128 / QR；支持从相册选择。', es: 'Foto al código: reconoce EAN / Code128 / QR; también desde galería.' },

  // 图片
  'img.deleteConfirm': { zh: '删除这张照片？', es: '¿Eliminar esta foto?' },
  'img.deleteFail': { zh: '删除失败', es: 'Error al eliminar' },
  'img.cover': { zh: '⭐ 主图', es: '⭐ Portada' },
  'img.role.front': { zh: '正面', es: 'Frente' },
  'img.role.back': { zh: '背面', es: 'Reverso' },
  'img.role.side': { zh: '侧面', es: 'Lateral' },
  'img.role.package': { zh: '包装', es: 'Embalaje' },
  'img.role.all_colors': { zh: '所有颜色合照', es: 'Todos los colores' },
  'img.role.single_color': { zh: '单个颜色', es: 'Un solo color' },
  'img.role.barcode': { zh: '条码/标签', es: 'Código / etiqueta' },
  'img.role.detail': { zh: '产品细节', es: 'Detalle' },
  'img.role.damaged': { zh: '瑕疵/破损', es: 'Defecto' },

  // 颜色
  'color.custom': { zh: '自定义颜色，如 Azul marino', es: 'Color personalizado (ej.: Azul marino)' },
  'color.add': { zh: '添加', es: 'Añadir' },

  // 上传队列
  'queue.pending': { zh: '等待上传', es: 'Pendiente' },
  'queue.uploading': { zh: '上传中', es: 'Subiendo' },
  'queue.done': { zh: '已完成', es: 'Completado' },
  'queue.failed': { zh: '失败', es: 'Fallido' },
  'queue.retry': { zh: '重试', es: 'Reintentar' },

  // 语音
  'audio.stop': { zh: '⏹ 停止', es: '⏹ Detener' },
  'audio.record': { zh: '🎤 录音', es: '🎤 Grabar' },
  'audio.uploading': { zh: '上传中...', es: 'Subiendo...' },
  'audio.noMic': { zh: '无法访问麦克风', es: 'No se puede acceder al micrófono' },
  'audio.uploadFail': { zh: '语音上传失败', es: 'Error al subir la nota de voz' },

  // 库存录入
  'inv.sufficient': { zh: '充足', es: 'Suficiente' },
  'inv.unknown': { zh: '未盘点', es: 'Sin contar' },
  'inv.stockEnough': { zh: '✅ 库存充足', es: '✅ Stock suficiente' },
  'inv.lastCapture': { zh: '上次采集', es: 'Última captura' },

  // 手机型号
  'phone.expand': { zh: '展开全部 {n} 个', es: 'Ver todos ({n})' },
  'phone.collapse': { zh: '收起', es: 'Ocultar' },
  'phone.refresh': { zh: '刷新型号', es: 'Actualizar modelos' },
  'phone.search': { zh: '🔍 搜索手机型号（如 S25 / Galaxy / iPhone 17）', es: '🔍 Buscar modelo (ej.: S25 / Galaxy / iPhone 17)' },
  'phone.searchResult': { zh: '匹配 {n} 个型号，点击勾选', es: '{n} modelos, toque para marcar' },
  'session.myTasksTitle': { zh: '📋 我的任务（{n}）', es: '📋 Mis tareas ({n})' },
  'session.myTasksHint': { zh: '草稿 / 已提交 / 退回的任务，点击查看或继续；不要的用 🗑 删除', es: 'Borradores / enviadas / rechazadas; toque para ver o continuar, 🗑 para eliminar' },
  'session.continueTask': { zh: '▶ 继续点货', es: '▶ Continuar' },
  'session.noDraft': { zh: '暂无任务', es: 'Sin tareas' },
  'task.viewTask': { zh: '👁 查看任务', es: '👁 Ver tarea' },
  'task.statusDraft': { zh: '草稿', es: 'Borrador' },
  'task.statusSubmitted': { zh: '待审核', es: 'En revisión' },
  'task.statusRejected': { zh: '已退回', es: 'Rechazada' },
  'task.delete': { zh: '删除', es: 'Eliminar' },
  'task.deleteConfirm': { zh: '确定删除这个采集任务吗？照片、库存、点货数据将一并删除，且不可恢复。', es: '¿Eliminar esta tarea? Fotos, inventario y datos de puntos se borrarán. No se puede deshacer.' },
  'task.deleteCurrentConfirm': { zh: '确定删除当前正在采集的任务吗？照片、库存、点货数据将一并删除，且不可恢复。', es: '¿Eliminar la tarea actual? Fotos, inventario y datos de puntos se borrarán. No se puede deshacer.' },
  'task.deleted': { zh: '✅ 已删除', es: '✅ Eliminada' },
  'task.deleteFail': { zh: '删除失败', es: 'Error al eliminar' },

  // 会话
  'session.select': { zh: '📋 采集会话', es: '📋 Sesión de captura' },
  'session.logout': { zh: '退出', es: 'Salir' },
  'session.operator': { zh: '操作员', es: 'Operario' },
  'session.activeTitle': { zh: '活跃会话', es: 'Sesión activa' },
  'session.deleteConfirm': { zh: '确定删除会话 {code} 吗？删除后不可恢复。', es: '¿Eliminar la sesión {code}? No se puede deshacer.' },
  'session.deleteConfirmWithTasks': { zh: '确定删除会话 {code} 吗？\n\n⚠️ 该会话下有 {n} 个任务，将一并删除（照片、库存、点货数据），且不可恢复。', es: '¿Eliminar la sesión {code}?\n\n⚠️ La sesión tiene {n} tareas que también se eliminarán (fotos, inventario, datos). No se puede deshacer.' },
  'session.deleted': { zh: '✅ 会话已删除', es: '✅ Sesión eliminada' },
  'session.deleteFail': { zh: '删除会话失败', es: 'Error al eliminar sesión' },
  'session.pick': { zh: '选择会话', es: 'Elegir sesión' },
  'session.useEmpty': { zh: '（空白 = 使用当前会话）', es: '(vacío = sesión actual)' },
  'session.noActive': { zh: '暂无活跃采集会话', es: 'No hay sesión activa' },
  'session.resume': { zh: '▶ 继续该会话', es: '▶ Continuar sesión' },
  'session.newCount': { zh: '个任务', es: ' tareas' },

  // 提交 / 弹窗
  'capture.noPhotoConfirm': { zh: '还没有图片，确定要提交吗？', es: '¿Sin fotos, enviar de todos modos?' },
  'capture.submitSuccess': { zh: '提交成功', es: 'Enviado correctamente' },
  'capture.submitFail': { zh: '提交失败', es: 'Error al enviar' },
  'capture.loadFail': { zh: '获取采集状态失败', es: 'Error al cargar estado' },
  'dialog.close': { zh: '✕ 关闭', es: '✕ Cerrar' },
  'capture.reviewTitle': { zh: '任务已提交', es: 'Tarea enviada' },

  // 盘点补充
  'inv.warehouse': { zh: '仓库盘点', es: 'Inventario de almacén' },
  'inv.newConfirm': { zh: '确认新建本批盘点？', es: '¿Crear nuevo lote?' },
  'inv.startHint': { zh: '选择产品开始盘点', es: 'Elija producto para empezar' },
  'inv.model': { zh: '型号', es: 'Modelo' },
  'inv.total': { zh: '总计', es: 'Total' },
  'inv.real': { zh: '实际', es: 'Real' },
  'inv.web': { zh: '网站', es: 'Web' },

  // 会话弹窗 / 顶部
  'session.title': { zh: '采集会话', es: 'Sesión de captura' },
  'session.noArea': { zh: '无区域', es: 'Sin zona' },
  'session.tasks': { zh: '任务', es: 'tareas' },
  'session.btn': { zh: '会话', es: 'Sesión' },
  'network.connected': { zh: '已连接电脑', es: 'Conectado al PC' },
  'network.disconnected': { zh: '无法连接电脑', es: 'Sin conexión al PC' },
  'queue.pendingCount': { zh: '待上传', es: 'Pendientes' },

  // alert 消息
  'alert.needSession': { zh: '请先创建采集会话', es: 'Cree primero una sesión' },
  'alert.createFail': { zh: '创建失败', es: 'Error al crear' },
  'alert.createTaskFail': { zh: '创建采集任务失败', es: 'Error al crear la tarea' },
  'alert.loadTaskFail': { zh: '加载任务失败', es: 'Error al cargar la tarea' },
  'alert.dupPhoto': { zh: '这张照片已上传（重复图片已跳过）', es: 'Foto ya subida (duplicada omitida)' },
  'alert.uploadFail': { zh: '上传失败', es: 'Error al subir' },
  'alert.retakePhoto': { zh: '请重新拍照上传（失败的文件已从队列移除）', es: 'Vuelva a hacer la foto (archivos fallidos eliminados)' },
  'alert.saveFail': { zh: '保存失败', es: 'Error al guardar' },
  'alert.reopenFailMsg': { zh: '无法重新打开任务', es: 'No se pudo reabrir la tarea' },
  'alert.reopenFail': { zh: '重新打开任务失败', es: 'Error al reabrir la tarea' },
  'alert.submitted': { zh: '✅ 已提交', es: '✅ Enviado' },
  'alert.needPhoto': { zh: '请先至少拍摄一张照片', es: 'Haga al menos una foto' },
  'alert.alreadyCaptured': { zh: '⚠️ 该产品已采集过（上次状态：{st}，时间：{tm}）\n\n确定要新建采集任务吗？', es: '⚠️ Producto ya capturado (estado: {st}, hora: {tm})\n\n¿Crear nueva tarea?' },

  // 盘点补充 2
  'inv.doneConfirm': { zh: '确定完成本次盘点？', es: '¿Finalizar este inventario?' },
  'inv.doneMsg': { zh: '✅ 盘点已完成', es: '✅ Inventario completado' },
  'inv.searchPh': { zh: '输入 Reference / EAN / 型号...', es: 'Escriba Reference / EAN / Modelo...' },
  'inv.clickStart': { zh: '点击开始盘点', es: 'Toca para empezar' },
  'inv.diff': { zh: '差异', es: 'diferencia' },
  'alert.searchFail': { zh: '搜索失败', es: 'Error de búsqueda' },
  'alert.addFail': { zh: '添加失败', es: 'Error al añadir' },

  // 颜色快捷选项（显示按语言，入库统一西语）
  'color.black': { zh: '黑', es: 'Negro' },
  'color.white': { zh: '白', es: 'Blanco' },
  'color.gray': { zh: '灰', es: 'Gris' },
  'color.red': { zh: '红', es: 'Rojo' },
  'color.orange': { zh: '橙', es: 'Naranja' },
  'color.yellow': { zh: '黄', es: 'Amarillo' },
  'color.green': { zh: '绿', es: 'Verde' },
  'color.blue': { zh: '蓝', es: 'Azul' },
  'color.purple': { zh: '紫', es: 'Morado' },
  'color.pink': { zh: '粉', es: 'Rosa' },
  'color.brown': { zh: '棕', es: 'Marrón' },
  'color.transparent': { zh: '透明', es: 'Transparente' },
  'color.other': { zh: '其他', es: 'Otro' },

  // MobileCapturePage 剩余（重复采集提示 / 上传弹窗 / 新增产品）
  'capture.multiMatch': { zh: '匹配到多个产品，请使用搜索选择', es: 'Varios productos, use Buscar para elegir' },
  'capture.queryFail': { zh: '查询失败', es: 'Error de consulta' },
  'capture.pickFromCandidates': { zh: '请从候选中选择', es: 'Elija de los candidatos' },
  'capture.duplicateTitle': { zh: '该产品已有未审核采集任务', es: 'Ya existe una tarea pendiente de revisión' },
  'capture.duplicateCreated': { zh: '创建时间', es: 'Creada' },
  'capture.duplicateContinue': { zh: '继续原任务', es: 'Continuar tarea' },
  'capture.duplicateNew': { zh: '创建新任务', es: 'Nueva tarea' },
  'capture.pendingFiles': { zh: '待上传 {n} 张，点击设置', es: '{n} pendientes, toque para configurar' },
  'capture.uploaded': { zh: '已上传 {n} 张：', es: '{n} subidas:' },
  'capture.addedAlert': { zh: '产品 {ref} 已新增，请拍照上传', es: 'Producto {ref} añadido, suba una foto' },
  'upload.photoRole': { zh: '照片用途', es: 'Uso de la foto' },
  'upload.colorRequired': { zh: '该照片对应的颜色（必选）', es: 'Color de la foto (obligatorio)' },
  'upload.colorsIncluded': { zh: '合照包含的颜色', es: 'Colores incluidos' },
  'upload.singleColorNeed': { zh: '单个颜色照片必须至少选择一个颜色', es: 'Foto de un color: elija al menos uno' },
  'upload.submitRole': { zh: '上传（{role}）', es: 'Subir ({role})' },
  'new.fillName': { zh: '请填写产品名称', es: 'Escriba el nombre del producto' },
  'new.fail': { zh: '新增产品失败', es: 'Error al crear el producto' },
  'inv.batch': { zh: '批次', es: 'Lote' },

  // 产品状态标签 / 详情
  'ps.noImages': { zh: '缺图片', es: 'Sin fotos' },
  'ps.hasImages': { zh: '已有图片', es: 'Con fotos' },
  'ps.notBound': { zh: '未绑定网站', es: 'Sin vincular a web' },
  'ps.activeCapture': { zh: '已有未完成采集', es: 'Captura pendiente' },
  'ps.lastCapture': { zh: '上次采集 {d}', es: 'Última captura {d}' },
  'ps.ready': { zh: '可采集', es: 'Listo para capturar' },
  'ps.refresh': { zh: '刷新状态', es: 'Refrescar' },
  'ps.category': { zh: '分类', es: 'Categoría' },
  'common.opFail': { zh: '操作失败', es: 'Error de operación' },

  // 确认对话框标题（避免西语下显示中文兜底）
  'task.deleteTitle': { zh: '删除任务', es: 'Eliminar tarea' },
  'session.deleteTitle': { zh: '删除会话', es: 'Eliminar sesión' },
  'alert.saved': { zh: '已保存', es: 'Guardado' },
  'alert.alreadyCapturedTitle': { zh: '重新采集', es: 'Recapturar' },
  'capture.noPhotoTitle': { zh: '提交确认', es: 'Confirmar envío' },
  'inv.doneTitle': { zh: '完成盘点', es: 'Finalizar recuento' },
};

// ===== Context =====
const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string }>({
  lang: 'es',
  setLang: () => {},
  t: (k) => k,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const s = localStorage.getItem('mobile_lang');
      return s === 'es' ? 'es' : s === 'zh' ? 'zh' : 'es'; // 默认西语
    } catch { return 'es'; }
  });

  useEffect(() => {
    try { localStorage.setItem('mobile_lang', lang); } catch { /* 忽略 */ }
    document.documentElement.lang = lang === 'es' ? 'es' : 'zh-CN';
  }, [lang]);

  const t = (key: string) => {
    const e = DICT[key];
    if (!e) return key;
    return lang === 'es' ? e.es : e.zh;
  };

  return (
    <LangContext.Provider value={{ lang, setLang: setLangState, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useI18n() {
  return useContext(LangContext);
}

/** 语言切换按钮（手机端右上角） */
export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'zh' ? 'es' : 'zh')}
      style={{ border: '1px solid var(--border-color)', background: 'var(--bg-hover)', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0 }}
      title="切换语言 / Cambiar idioma"
    >
      {lang === 'zh' ? '🌐 ES' : '🌐 中文'}
    </button>
  );
}

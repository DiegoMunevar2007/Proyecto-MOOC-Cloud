# Operación, evidencias y reconstrucción

## Antes de crear recursos

No ejecutar `apply`, publicación de imágenes, importación, borrado ni `destroy` sin permiso explícito del responsable en ese momento. Las lecturas y planes están permitidos. Trabajar en el directorio original `scripts/IaC`: el estado es local; no copiarlo a otro worktree.

1. Consultar `gcloud compute instances list --filter='name~^mooc-'` y el resto de recursos de entrega 2.
2. Si existen recursos `mooc-*` y falta tfstate, detenerse y mostrar el inventario. No importar ni recrear por cuenta propia.
3. Comprobar identidad/proyecto, región y cuota, tfvars ignorado, imagen final y ausencia de cambios inesperados.
4. Ejecutar `terraform init`, `terraform validate` y `terraform plan -out=plan.tfplan`. Revisar el plan nuevo: el plan de 108 recursos del handoff referencia una imagen anterior.
5. Cuando se autorice publicar código: construir las tres imágenes con `scripts/publish_images.sh`, actualizar image_tag local y rehacer el plan. Cuando se autorice desplegar: aplicar ese plan concreto.

No ejecutar el `-target` del README histórico: Artifact Registry ya existe. No versionar tfvars, estado, plan, credenciales, tokens ni datasets con sesiones.

## Validación posterior

Guardar salidas con fecha UTC en `docs/entrega3/evidencia/<corrida>/`, eliminando secretos. Ejecutar desde IaC:

```bash
terraform output app_url
terraform output lb_ip
gcloud compute instance-groups managed list-instances mooc-api-mig --zone us-central1-a
gcloud compute instance-groups managed list-instances mooc-worker-mig --zone us-central1-a
gcloud compute backend-services get-health mooc-api-backend --global
gcloud compute ssl-certificates list
```

Por VM, capturar guest attributes `mooc/status` y `mooc/ready-uptime-sec`; revisar logs de arranque sin exportar secretos. En queue, revisar `journalctl -u mooc-queue-metrics`; en autoscalers, `statusDetails` y `recommendedSize`. Verificar `/health` por HTTPS y `X-Served-By`. Certificado administrado debe estar ACTIVE para el recorrido de navegador.

Registrar en `despliegue.json`: commit, image_tag, app_url, lb_ip, proyecto, zona, fecha, tipos de VM, tamaños efectivos, límites del pool, concurrencia y evidencia del certificado. Son datos observados: no rellenarlos con valores supuestos.

## Integridad y salud

- Enviar una secuencia autenticada con el mismo token a través del LB; correlacionar X-Served-By y misma identidad/datos entre al menos dos APIs.
- Crear inscripción, intento y progreso; reenviar el mismo intento y comprobar nota/efectos únicos en PostgreSQL administrado.
- Con permiso para la prueba de fallo, detener únicamente el contenedor API de una VM identificada. Observar primero exclusión del LB y luego, separadamente, eventual reparación de MIG. No hacerlo sobre la única API disponible.
- Registrar peticiones en curso y drenaje al retirar API. Verificar datos después del reemplazo.
- Con permiso para retiro, identificar un worker con tarea activa y ejecutar la acción acordada. Guardar logs antes/después por ID, destino de recuperación y objetos finales. **Esta prueba controlada no reemplaza la reducción automática del escenario 3B.**
- Conciliar todos los trabajos aceptados; fallos requieren causa diagnosticada, no descartar filas.

## Corridas y conservación

1. Ejecutar el recorrido de [frontend](frontend.md).
2. Escenarios 1 y 2 con la misma demanda y corpus de entrega 2; repetir corridas y conservar resultados sin sobrescribirlos.
3. Escenarios 3A y 3B independientes; registrar demanda, señal, recomendación, creación, estado operativo, consumo/balanceo y retiro.
4. Exportar Cloud Monitoring y logs; conservar versión del generador y comprobar que no está saturado.
5. Completar informe, costos y video con datos reales. El video puede usar registros de procesos largos si están completos y accesibles.

## Retiro y reconstrucción

Después de conservar evidencia y respaldos, presentar inventario y plan de retiro al responsable. `terraform destroy` requiere una orden explícita; **no se ejecuta como cleanup de pruebas, CI ni scripts de observación**. No existe un apagado gratuito que conserve todos los recursos.

Para reconstruir, conservar código/tag, imágenes identificables, configuración no sensible y procedimiento. Recuperar secretos desde el canal privado, revisar recursos existentes/estado y volver al procedimiento autorizado. La sustentación debe usar Cloud SQL, aunque se haya verificado previamente en local.

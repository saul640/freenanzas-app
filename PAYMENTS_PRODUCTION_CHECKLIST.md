# Checklist de Producción para Pagos

Esta checklist debe completarse antes de abrir Freenanzas PRO al público. Guarda capturas, IDs de eventos y fechas de cada prueba.

## Configuración

- [ ] `PAYPAL_ENV=live` configurado en Firebase Functions.
- [ ] Secret `PAYPAL_CLIENT_ID` apunta a la app PayPal live correcta.
- [ ] Secret `PAYPAL_SECRET` apunta a la app PayPal live correcta.
- [ ] Secret `PAYPAL_WEBHOOK_ID` coincide con el webhook live configurado en PayPal.
- [ ] `VITE_PAYPAL_CLIENT_ID` corresponde al Client ID live.
- [ ] `VITE_PAYPAL_PLAN_ID_MONTHLY` corresponde al plan mensual live.
- [ ] `VITE_PAYPAL_PLAN_ID_ANNUAL` corresponde al plan anual live.
- [ ] Los fallback links de PayPal apuntan a los mismos planes live.
- [ ] `PAYPAL_ENV=live npm run verify:payments` pasa sin errores antes del deploy.

## Planes Reales

- [ ] Plan mensual creado en PayPal y marcado como activo.
- [ ] Plan anual creado en PayPal y marcado como activo.
- [ ] Precio mensual visible en la app coincide con PayPal.
- [ ] Precio anual visible en la app coincide con PayPal.
- [ ] Moneda visible en la app coincide con PayPal.

## Flujo de Compra

- [ ] Usuario nuevo inicia compra mensual desde producción.
- [ ] PayPal devuelve `subscriptionID`.
- [ ] `syncPayPalSubscription` valida la suscripción y activa PRO solo cuando PayPal devuelve `ACTIVE`.
- [ ] Documento `users/{uid}` queda con `isPro=true`, `paypalSubscriptionId`, `planType`, `paypalStatus`, `currentPeriodEnd` y `subscriptionUpdatedAt`.
- [ ] Repetir el flujo para plan anual.

## Webhook

- [ ] Webhook live configurado con URL `https://us-central1-freenanzas-app.cloudfunctions.net/paypalWebhook`.
- [ ] Evento real `BILLING.SUBSCRIPTION.ACTIVATED` recibido.
- [ ] Evento queda registrado en `paypalWebhookEvents/{eventId}` con `processedAt`.
- [ ] Reenvío del mismo evento no duplica cambios.
- [ ] Una firma inválida o payload sin firma no actualiza usuarios.

## Recibos y Eventos de Pago

- [ ] Evento real `PAYMENT.SALE.COMPLETED` recibido.
- [ ] Se crea registro en `users/{uid}/billingReceipts/{paymentId}`.
- [ ] El usuario puede ver el comprobante interno en Mi Suscripción.
- [ ] El usuario no puede escribir ni modificar `billingReceipts` desde el cliente.
- [ ] Soporte puede ubicar el recibo oficial en PayPal usando el ID del evento o pago.

## Cancelación y Reactivación

- [ ] Confirmar que el comportamiento comercial deseado es pausar renovación con PayPal `suspend`.
- [ ] Usuario PRO pausa renovación desde la app.
- [ ] PayPal cambia la suscripción a estado suspendido.
- [ ] Firestore refleja `cancelAtPeriodEnd=true`.
- [ ] Usuario puede reactivar desde la app.
- [ ] PayPal vuelve a estado activo y Firestore refleja `cancelAtPeriodEnd=false`.

## Legal y Dominio

- [ ] Política de reembolsos publicada y enlazada desde el paywall.
- [ ] Términos, privacidad, eliminación de datos y aviso IA publicados.
- [ ] Dominio propio comprado.
- [ ] Dominio propio conectado a Firebase Hosting.
- [ ] PayPal app/webhook actualizados con el dominio propio si aplica.
- [ ] App Check reCAPTCHA Enterprise actualizado con el dominio propio.

## Evidencia

No guardes tarjetas, tokens, secretos, correos completos de clientes reales ni capturas con datos financieros sensibles. Usa usuarios de prueba controlados y redacta IDs dejando solo los últimos 6 caracteres cuando el documento se comparta.

### Compra Mensual Live

- Fecha y zona horaria:
- Responsable:
- URL usada:
- UID de prueba redactado:
- Plan ID PayPal redactado:
- Subscription ID PayPal redactado:
- Resultado PayPal:
- Estado en Firestore `users/{uid}`:
- Captura del paywall:
- Captura de Mi Suscripción:
- Observaciones:

### Compra Anual Live

- Fecha y zona horaria:
- Responsable:
- URL usada:
- UID de prueba redactado:
- Plan ID PayPal redactado:
- Subscription ID PayPal redactado:
- Resultado PayPal:
- Estado en Firestore `users/{uid}`:
- Captura del paywall:
- Captura de Mi Suscripción:
- Observaciones:

### Webhook de Activación

- Fecha y zona horaria:
- Responsable:
- Evento PayPal recibido:
- Event ID redactado:
- `paypalWebhookEvents/{eventId}` tiene `processedAt`:
- Firma verificada por backend:
- Resultado al reenviar el mismo evento:
- Evidencia de que no duplicó cambios:
- Observaciones:

### Recibo PayPal

- Fecha y zona horaria:
- Responsable:
- Evento de pago recibido:
- Payment/Event ID redactado:
- Ruta `users/{uid}/billingReceipts/{paymentId}`:
- Monto y moneda esperados:
- Comprobante interno visible en Mi Suscripción:
- Recibo oficial ubicable en PayPal:
- Observaciones:

### Pausa de Renovación

- Fecha y zona horaria:
- Responsable:
- Subscription ID PayPal redactado:
- Estado PayPal antes:
- Estado PayPal después de `suspend`:
- Firestore `cancelAtPeriodEnd`:
- Firestore `paypalStatus`:
- Acceso PRO durante periodo pagado:
- Observaciones:

### Reactivación

- Fecha y zona horaria:
- Responsable:
- Subscription ID PayPal redactado:
- Estado PayPal antes:
- Estado PayPal después de `activate`:
- Firestore `cancelAtPeriodEnd`:
- Firestore `paypalStatus`:
- Acceso PRO restaurado solo con estado `ACTIVE`:
- Observaciones:

### Dominio Propio

- Fecha y zona horaria:
- Responsable:
- Dominio comprado:
- Firebase Hosting conectado:
- Certificado SSL activo:
- PayPal app/webhook actualizado:
- App Check actualizado:
- URL pública verificada:
- Observaciones:

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

| Fecha | Responsable | Prueba | Evidencia |
| --- | --- | --- | --- |
|  |  | Compra mensual live |  |
|  |  | Compra anual live |  |
|  |  | Webhook activación |  |
|  |  | Recibo PayPal |  |
|  |  | Pausa renovación |  |
|  |  | Reactivación |  |
|  |  | Dominio propio |  |

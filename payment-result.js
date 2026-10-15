const params = new URLSearchParams(window.location.search);
const status = params.get("status");
const title = document.querySelector("#paymentTitle");
const message = document.querySelector("#paymentMessage");

if (status === "success") {
  title.textContent = "Pago recibido";
  message.textContent = "Mercado Pago informo que el pago fue aprobado. Vamos a preparar tu pedido.";
} else if (status === "failure") {
  title.textContent = "El pago no se completo";
  message.textContent = "No se registro el pago. Podes volver a la tienda e intentar nuevamente.";
} else if (status === "pending") {
  title.textContent = "Pago pendiente";
  message.textContent = "Tu pago quedo pendiente. Te avisaremos cuando el proveedor confirme el estado final.";
}

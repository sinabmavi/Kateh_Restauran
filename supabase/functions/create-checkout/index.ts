// create-checkout: turns "what the guest wants" into a payable order or reservation.
// The browser sends items and details, never prices. Everything is validated and priced here with the service role.
import { getUser, serviceClient } from '../_shared/clients.ts'
import { HttpError, handle, json, readJson } from '../_shared/http.ts'
import { createOrderCheckout } from './order.ts'
import { createReservationCheckout } from './reservation.ts'

Deno.serve(
  handle(async (request) => {
    const body = await readJson(request)
    const admin = serviceClient()
    const user = await getUser(admin, request)

    if (body.kind === 'order') return json(await createOrderCheckout(admin, user, body))
    if (body.kind === 'reservation') return json(await createReservationCheckout(admin, user, body))
    throw new HttpError(400, 'BAD_REQUEST', 'Unknown checkout type.')
  }),
)

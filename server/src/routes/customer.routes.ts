import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { addContact, deleteContact, getCustomer, updateContact } from '../controllers/customer.controller.js'

// Customer detail and contacts: every signed-in role in the company can read;
// writes follow the ownership rule in customer.controller.ts.
const router = Router()
router.use(requireAuth)

router.get('/customers/:id', getCustomer)
router.post('/customers/:id/contacts', addContact)
router.patch('/contacts/:id', updateContact)
router.delete('/contacts/:id', deleteContact)

export default router

import AdminBar from '../../components/layout/adminpage/adminbar'
import Container from 'react-bootstrap/Container'
import AdminBody from '../../components/layout/adminpage/adminbody'
import EventsTable from '../../components/functional/eventstable'
export default function AdminEvents () {
    return (
        <Container fluid className="bg-dark text-light">
             <AdminBar />
             <AdminBody>
                 <h2>Is HPP Open Events Admin</h2>
                 <h6 className="mb-3">Add, edit and delete events. You currently will not get a notification on changing an event. WARNING: clicking the delete event button is final!</h6>
                <EventsTable />
             </AdminBody>
        </Container>
        
    )
}
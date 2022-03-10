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
                 <h6 className="mb-3">Add, edit and delete events. Deleting events is final, so be careful.</h6>
                <EventsTable />
             </AdminBody>
        </Container>
        
    )
}
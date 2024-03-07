import AdminBar from '../../components/layout/adminpage/adminbar'
import Container from 'react-bootstrap/Container'
import AdminBody from '../../components/layout/adminpage/adminbody'
import MessageEditor from '../../components/functional/messageeditor'



export default function AdminMessage () {
    return (
        <Container fluid className="bg-dark">
             <AdminBar />
             <AdminBody>
                 <h2 className="text-light">Is HPP Open Admin panel - Message Admin</h2>
                 {/* This uses the /sitebanner api to update the site banner message */}
                    {/* The message is stored in the database and is used to display a message on the front page */}
                    {/* The message is updated by the admin panel */}

                <MessageEditor />
             </AdminBody>
        </Container>
        
    )
}
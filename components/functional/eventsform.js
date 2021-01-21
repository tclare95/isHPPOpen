import { Formik } from 'formik';
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Button from 'react-bootstrap/Button'
import axios from 'axios'

export default function EventsForm (props) {
      
    const handleDeleteClick = (id) => {
        axios.delete(`/api/events/?${id}`,{withCredentials: true}).then((response) => {
            try {
                console.log('success')
                
            } catch {
                console.log('error from the server')
                console.log(response)
            }
        })
    }

      const {id='', name='', startDate=new Date, endDate=new Date, eventDetails=''} = props;
      return (
        
        <Formik
        enableReinitialize="true"
        initialValues={{id:id, name:name, startDate:startDate.toISOString().split('T')[0], endDate:endDate.toISOString().split('T')[0], eventDetails:eventDetails}}
        onSubmit={(values, { setSubmitting }) => {
            const dataArray = {
                new_event_id: values.id,
                new_event_name: values.name,
                new_event_start_date: values.startDate,
                new_event_end_date: values.endDate,
                new_event_details: values.eventDetails,
            }
            const json = JSON.stringify(dataArray)
            console.log(json)
            axios.post("/api/events", json, {withCredentials: true}).then((response => {
           if (response.status === 200) {
            console.log('event successfully added')

            } else {
            console.log('error from the server')
           }
            }))
          }}
        
        >
        {formik => (
            <Row className="justify-content-center text-light border-form my-1">
            <Form onSubmit={formik.handleSubmit}>
            <Form.Row className="my-auto">
            <Col className="col-1">
            <Form.Label htmlFor="id">ID</Form.Label>
            <Form.Control
              id="id"
              name="id"
              onChange={formik.handleChange}
              value={formik.values.id}
              disabled
            />
            </Col>
            <Col className="col-2">
            <Form.Label htmlFor="name">Event Name</Form.Label>
            <Form.Control
              id="name"
              name="name"
              onChange={formik.handleChange}
              value={formik.values.name}
              
            />
            </Col>
            <Col className="col-2">
            <Form.Label htmlFor="startDate">Event Start Date</Form.Label>
            <Form.Control
              id="startDate"
              name="startDate"
              type="date"
              onChange={formik.handleChange}
              value={formik.values.startDate}
              
            />
            </Col>
            <Col className="col-2">
            <Form.Label htmlFor="endDate">Event End Date</Form.Label>
            <Form.Control
              id="endDate"
              name="endDate"
              type="date"
              onChange={formik.handleChange}
              value={formik.values.endDate}
              
            />
            </Col>
            <Col className="col-3">
            <Form.Label htmlFor="eventDetails">Event Details</Form.Label>
            <Form.Control
              id="eventDetails"
              name="eventDetails"
              as="textarea"
              onChange={formik.handleChange}
              value={formik.values.eventDetails}
              
            />
            </Col>
            <Col className="align-items-center justify-content-center my-auto mx-auto">
            <Button type="submit">{formik.values.id ? 'Edit Event' : 'Add Event'}</Button>
            </Col>
            <Col className="align-items-center justify-content-center my-auto mx-auto">
            <Button variant="danger" onClick={() => handleDeleteClick(props.id)}>Delete Event</Button>
            </Col>
            </Form.Row> 
          </Form>
          </Row>
        )}

        </Formik>


        
      );
}
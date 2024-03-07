import { Formik, Form, Field, ErrorMessage } from 'formik';
import axios from 'axios';
import useSWR, { mutate } from 'swr';
import { useState } from 'react';

const fetcher = (url) => axios.get(url).then((res) => res.data);

export default function MessageEditor() {
    const { data: messageData, error: messageError } = useSWR("/api/sitebanner", fetcher);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(false);

    if (!messageData) {
        return <p>Loading...</p>;
    }

    if (messageError) {
        return <p>Error fetching message</p>;
    }

    return (
        <>
            <div>
                <h2>Current Message:</h2>
                <p>{messageData[0].banner_message}</p>
            </div>
            <Formik
                initialValues={{
                    message: messageData[0].banner_message,
                    banner_start_date: new Date().toISOString(), // Default start date
                    banner_end_date: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString(), // Default end date +7 days
                }}
                onSubmit={(values, { setSubmitting, resetForm }) => {
                    setSubmitting(true);
                    axios
                        .post("/api/sitebanner", {
                            banner_message: values.message,
                            banner_start_date: values.banner_start_date,
                            banner_end_date: values.banner_end_date,
                        }, { withCredentials: true })
                        .then((response) => {
                            setSuccess(true);
                            setSubmitting(false);
                            resetForm();
                            mutate("/api/sitebanner"); // Revalidate cache to reflect updated data
                        })
                        .catch((error) => {
                            console.error("Error updating message:", error);
                            setError(true);
                            setSubmitting(false);
                        });
                }}
            >
                {({ isSubmitting }) => (
                    <Form>
                        <Field type="text" name="message" />
                        <ErrorMessage name="message" component="div" />
                        <button type="submit" disabled={isSubmitting}>
                            Update Message
                        </button>
                    </Form>
                )}
            </Formik>
            {success && <p>Message updated successfully!</p>}
            {error && <p>Error updating the message.</p>}
        </>
    );
}

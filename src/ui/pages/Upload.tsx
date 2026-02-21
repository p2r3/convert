import Footer from "../components/Footer"
import UploadField from "../components/Upload/UploadField"

import './Upload.css'

interface UploadPageProps {

}

export default function Upload(props: UploadPageProps | undefined) {
	return (
		<>
			<UploadField />
			<Footer />
		</>
	)
}

import Footer from "src/ui/components/Footer"
import UploadField from "src/ui/components/Upload/UploadField"

import './index.css'

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

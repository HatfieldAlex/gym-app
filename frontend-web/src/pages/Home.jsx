import { useDocumentTitle } from '../hooks.js'

export default function Home() {
  useDocumentTitle('Gym App')

  return (
    <>
      <h1>Gym App</h1>
      <p>
        A React single-page app in <code>frontend-web/</code>, with its data fetched from the
        DRF API at <code>/api/v1/</code>.
      </p>
    </>
  )
}

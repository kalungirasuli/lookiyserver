import express, { Request, Response } from 'express'
import authRouter from './routes/auth';

const app = express()
const port = 3000

app.use(express.json());
app.use('/api/auth', authRouter);

app.get('/', (req: Request, res: Response) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})
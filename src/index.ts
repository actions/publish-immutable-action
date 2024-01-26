/**
 * The entrypoint for the action.
 */
import { run } from './main'
import minimist from 'minimist'

const path = minimist(process.argv.slice(2)).path || '.'
// eslint-disable-next-line @typescript-eslint/no-floating-promises
run(path)

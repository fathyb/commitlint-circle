import Octokit from '@octokit/rest'
import execa from 'execa'

const NotFound = new Error()

const git = (...args: string[]) => execa.stdout('git', args)

const checkCommit = async (...refs: string[]) =>
    Promise.all(
        refs.map(ref =>
            git('cat-file', '-e', ref)
        )
    )

const matchGithub = <T>(url: string | undefined, prop: string) => {
    if(!url) {
        throw NotFound
    }

    const match = url.match(new RegExp(`github\\.com/(.+)/(.+)/${prop}/(.+)`))

    if(!match) {
        throw NotFound
    }

    const [_, owner, repo, data] = match

    return {owner, repo, data}
}

const getRangeFromPr = async () => {
    const {owner, repo, data: pull} = matchGithub(process.env['CIRCLE_PULL_REQUEST'], 'pull')
    const github = new Octokit()
    if (process.env.GITHUB_TOKEN)
        github.authenticate({ type: 'token', token: process.env.GITHUB_TOKEN || '' })
    
    console.log('📡   Looking up PR #%s...', pull)
    const {data: {base, head}} = await github.pullRequests.get(
        {owner, repo, number: +pull}
    )

    await checkCommit(base.sha, head.sha)
    
    console.log('🔀   Linting PR #%s', pull)

    return [base.sha, head.sha]
}

const getRangeFromCompare = async () => {
    const [from, to] = matchGithub(process.env['CIRCLE_COMPARE_URL'], 'compare').data.split('...')
    
    await checkCommit(from, to)
    console.log('🎏   Linting using comparison URL %s...%s', from, to) 
    
    return [from, to]
}

const getRangeFromSha = async () => {
    const sha = process.env['CIRCLE_SHA1']

    if(!sha) {
        throw new Error('Cannot find CIRCLE_SHA1 environment variable')
    }

    await checkCommit(sha)
    console.log('⚙️   Linting using CIRCLE_SHA1 (%s)', sha)
    
    return ['origin/master', sha]
}

const getRangeFromGit = async () => {
    const head = await git('rev-parse', '--verify', 'HEAD')

    await checkCommit(head)
    console.log('⚙️   Linting using git HEAD (%s)', head)

    return ['origin/master', head]
}

const lint = ([from, to]: string[]) =>
    execa(
        'node',
        [require('@commitlint/cli'), '--from', from, '--to', to],
        {stdio: 'inherit'}
    )

export const run = () =>
    getRangeFromPr()
        .catch(getRangeFromCompare)
        .catch(getRangeFromSha)
        .catch(getRangeFromGit)
        .then(lint)

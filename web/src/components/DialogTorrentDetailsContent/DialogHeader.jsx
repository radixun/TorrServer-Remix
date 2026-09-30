import { AppBar, IconButton, makeStyles, Toolbar, Typography } from '@material-ui/core'
import CloseIcon from '@material-ui/icons/Close'
import { ArrowBack } from '@material-ui/icons'
import { isStandaloneApp } from 'utils/Utils'

const useStyles = makeStyles(theme => ({
  appBar: {
    position: 'relative',
    background: theme.palette.type === 'dark' ? '#071421' : '#fff',
    color: theme.palette.type === 'dark' ? '#e8f2fb' : '#111827',
    boxShadow: 'none',
    borderBottom: `1px solid ${theme.palette.type === 'dark' ? '#17344d' : '#dfe8ea'}`,
    ...(isStandaloneApp && { paddingTop: '30px' }),
  },
  toolbar: {
    minHeight: 56,
    paddingLeft: theme.spacing(3),
    paddingRight: theme.spacing(3),
  },
  title: { marginLeft: '5px', flex: 1, fontWeight: 500, fontSize: 18 },
}))

export default function DialogHeader({ title, onClose, onBack }) {
  const classes = useStyles()

  return (
    <AppBar className={classes.appBar}>
      <Toolbar className={classes.toolbar}>
        {onBack && (
          <IconButton edge='start' color='inherit' onClick={onBack} aria-label='back'>
            <ArrowBack />
          </IconButton>
        )}

        <Typography variant='h6' className={classes.title}>
          {title}
        </Typography>

        <IconButton autoFocus color='inherit' onClick={onClose} aria-label='close' style={{ marginRight: '-10px' }}>
          <CloseIcon />
        </IconButton>
      </Toolbar>
    </AppBar>
  )
}
